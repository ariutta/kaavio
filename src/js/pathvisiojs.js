var _ = require('lodash');
var fs = require('fs');
var insertCss = require('insert-css');
var highland = require('highland');
var promisescript = require('promisescript');
var Utils = require('./utilities');
var Renderer = require('./renderer/renderer');
var FormatConverter = require('./format-converter/format-converter');

var css = [fs.readFileSync(__dirname + '/../css/annotation.css'),
          fs.readFileSync(__dirname + '/../css/pan-zoom.css'),
          fs.readFileSync(__dirname + '/../css/pathvisiojs.css'),
          fs.readFileSync(__dirname + '/../css/pathway-diagram.css')];

/**
 * initPathvisiojs
 *
 * @param {object} window
 * @param {object} $
 * @return
 */
function initPathvisiojs(window, $) {
  'use strict';

  Renderer = Renderer();
  css.map(insertCss);

  /**
   * Pathvisiojs constructor
   *
   * @param {object} element Dom element
   * @param {object} options
   */
  var Pathvisiojs = function(element, options) {
    this.init(element, options);
  };

  var instanceCounter = 0;
  var optionsDefault = {
    fitToContainer: true,
    sourceData: [],
    manualRender: false
  };

  /**
   * Pathvisiojs initialisation
   *
   * @param  {object} element Dom element
   * @param  {object} options
   */
  Pathvisiojs.prototype.init = function(element, options) {
    this.$element = d3.select(element).html(''); // select and empty the element

    // Clone and fill options
    this.options = _.clone(optionsDefault, true);
    this.options = _.assign(this.options, options);

    // Make this instance unique
    this.instanceId = ++instanceCounter;

    // Init events object
    this.events = {};

    this.initContainer();

    // Check if render should be called now or it will be done later manually
    if (!this.options.manualRender) {
      this.render();
    }
  };

  /**
   * Creates DOM container and parses its sizes.
   * Adds loading state to container.
   * Adds hook for loaded event to remove loading state
   */
  Pathvisiojs.prototype.initContainer = function() {
    var pvjs = this;
    var containerContents = fs.readFileSync(
        __dirname + '/../pathvisiojs.html').toString();

    // Add default container elements
    this.$element.html(containerContents);

    // Set ID to $element if it has no ID
    this.$element.attr('id', this.$element.attr('id') ||
        'pathvisio-' + this.instanceId);

    // TODO figure out the best way to handle styling of the
    // pathvisiojs container as a whole and the viewer/editor.
    // Also, consider our defaults vs. the user-specified
    // styles. I've commented this out for the moment, because
    // it overrides user-specified styles.
    // Set container class
    //Utils.addClassForD3(this.$element, 'pathvisiojs-container');

    // Set loading class
    Utils.addClassForD3(this.$element, 'loading');

    // Remove loading state after pathvisiojs is loaded
    this.on('rendered', function() {
      Utils.removeClassForD3(pvjs.$element, 'loading');
    });

    // Get container sizes
    var boundingRect = this.$element[0][0].getBoundingClientRect();

    // TODO take in account paddings, margins and border
    this.element_width = +boundingRect.width;

    // TODO take in account paddings, margins and border
    this.element_height = +boundingRect.height;
  };

  /**
   * Init and render
   */
  Pathvisiojs.prototype.render = function() {
    var pvjs = this;

    // Init sourceData object
    this.sourceData = {
      sourceIndex: -1,
      uri: null, // resource uri
      fileType: '',
      pvjson: null, // pvjson object
      selector: null, // selector instance
      rendererEngine: null // renderer engine name
    };

    this.checkAndRenderNextSource();

    // Listen for renderer errors
    this.on('error.renderer', function() {
      Renderer.destroyRender(pvjs, pvjs.sourceData);
      pvjs.checkAndRenderNextSource();
    });
  };

  Pathvisiojs.prototype.checkAndRenderNextSource = function() {
    var pvjs = this;

    this.sourceData.sourceIndex += 1;

    // Check if any sources left
    if (this.options.sourceData.length < this.sourceData.sourceIndex + 1) {
      this.trigger('error.sourceData', {
        message: 'No more renderable sources'
      });
      return;
    }

    this.sourceData.uri = this.options.sourceData[
      this.sourceData.sourceIndex].uri;
    this.sourceData.fileType = this.options.sourceData[
      this.sourceData.sourceIndex].fileType;

    if (Renderer.canRender(this.sourceData)) {
      if (Renderer.needDataConverted(this.sourceData)) {
        FormatConverter.loadAndConvert(pvjs, function(error, pvjson) {
          if (error) {
            pvjs.trigger('error.pvjson', {message: error});
            pvjs.checkAndRenderNextSource();
          } else {
            pvjs.sourceData.pvjson = pvjson;
            Renderer.render(pvjs);
          }
        });
      } else {
        Renderer.render(pvjs);
      }
    } else {
      // try next source
      this.checkAndRenderNextSource();
    }
  };

  Pathvisiojs.prototype.destroy = function() {
    // Send destroy message
    this.trigger(
        'destroy.pvjs', {message: 'User requested pvjs destroy'}, false)

    // Destroy renderer
    Renderer.destroyRender(this, this.sourceData)

    // Off all events
    for (var e in this.events) {
      this.off(e)
    }

    // Clean data
    this.$element[0][0].data = undefined

    if ($) {
      $(this.$element[0][0]).removeData('pathvisiojs')
    }

    // Clean HTML
    // jQuery
    $(this.$element[0][0]).empty()

  }

  /**
   * Returns an instance for public usage
   * @return {object}
   */
  Pathvisiojs.prototype.getPublicInstance = function() {
    var that = this;

    if (this.publicInstance === undefined) {
      // Initialise public instance
      this.publicInstance = {
        instanceId: this.instanceId,
        $element: this.$element,
        destroy: Utils.proxy(this.destroy, this),
        on: Utils.proxy(this.on, this),
        off: Utils.proxy(this.off, this),
        trigger: Utils.proxy(this.trigger, this),
        render: Utils.proxy(this.render, this),
        pan: function(point) {if (that.panZoom) {that.panZoom.pan(point);}},
        panBy: function(point) {if (that.panZoom) {that.panZoom.panBy(point);}},
        getPan: function() {return that.panZoom.getPan();},
        zoom: function(scale) {if (that.panZoom) {that.panZoom.zoom(scale);}},
        zoomBy: function(scale) {
          if (that.panZoom) {
            that.panZoom.zoomBy(scale);
          }
        },
        zoomAtPoint: function(scale, point) {
          if (that.panZoom) {
            that.panZoom.zoomAtPoint(scale, point);
          }
        },
        zoomAtPointBy: function(scale, point) {
          if (that.panZoom) {
            that.panZoom.zoomAtPointBy(scale, point);
          }
        },
        getZoom: function() {return that.panZoom.getZoom();},
        getOptions: function() {return _.clone(that.options, true);},
        getSourceData: function() {
        // return _.clone(that.sourceData, true);
        return {
          sourceIndex: that.sourceData.sourceIndex,
          uri: that.sourceData.uri,
          fileType: that.sourceData.fileType,
          pvjson: _.clone(that.sourceData.pvjson, true),
          selector: that.sourceData.selector.getClone(),
          rendererEngine: that.sourceData.rendererEngine
        };
      }
      };
    }

    return this.publicInstance;
  };

  /**
   * Register an event listener
   *
   * @param  {string}   topic
   * @param  {Function} callback
   */
  Pathvisiojs.prototype.on = function(topic, callback) {
    var namespace = null;
    var eventName = topic;

    if (topic.indexOf('.') !== -1) {
      var pieces = topic.split('.');
      eventName = pieces[0];
      namespace = pieces[1];
    }

    if (!this.events.hasOwnProperty(eventName)) {
      this.events[eventName] = [];
    }

    this.events[eventName].push({
      callback: callback,
      namespace: namespace
    });
  };

  /**
   * Removes an event listener
   * Returns true if listener was removed
   *
   * @param  {string}   topic
   * @param  {Function} callback
   * @return {bool}
   */
  Pathvisiojs.prototype.off = function(topic, callback) {
    var namespace = null;
    var eventName = topic;
    var flagRemove = true;
    callback = callback || null;

    if (topic.indexOf('.') !== -1) {
      var pieces = topic.split('.');
      eventName = pieces[0];
      namespace = pieces[1];
    }

    // Check if such an event is registered
    if (!this.events.hasOwnProperty(eventName)) {return false;}
    var queue = this.events[topic];

    for (var i = queue.length - 1; i >= 0; i--) {
      flagRemove = true;

      if (namespace && queue[i].namespace !== namespace) {flagRemove = false;}
      if (callback && queue[i].callback !== callback) {flagRemove = false;}

      if (flagRemove) {queue.splice(i, 1);}
    }

    return true;
  };

  /**
   * Triggers an event. Async by default.
   * Returns true if there is at least one listener
   *
   * @param  {string} topic
   * @param  {object} message
   * @param  {bool} async By default true
   * @return {bool}
   */
  Pathvisiojs.prototype.trigger = function(topic, message, async) {
    var namespace = null;
    var eventName = topic;

    if (topic.indexOf('.') !== -1) {
      var pieces = topic.split('.');
      eventName = pieces[0];
      namespace = pieces[1];
    }

    if (!this.events.hasOwnProperty(eventName)) {return false;}

    var queue = this.events[eventName];
    if (queue.length === 0) {return false;}

    if (async === undefined) {
      async = true;
    }

    // Use a function as i may change meanwhile
    var callAsync = function(i) {
      setTimeout(function() {
        queue[i].callback(message);
      }, 0);
    };

    for (var i = 0; i < queue.length; i++) {
      if (namespace && queue[i].namespace && namespace !== queue[i].namespace) {
        continue;
      }

      if (async) {
        // freeze i
        callAsync(i);
      } else {
        queue[i].callback(message);
      }
    }
    return true;
  };

  /**
   *
   */
  // TODO re-enable the jQuery entry point. I removed it to make pathvisiojs
  // work with the wikipathways-pathvisiojs custom element, but it would be
  // good to re-enable it.
  if ($) {
    /**
     * jQuery plugin entry point. Only if jQuery is defined.
     * If option is 'get' then returns an array of pathvisiojs public instances.
     * Otherwise returns an jQuery object to allow chaining.
     *
     * @param  {string} option
     * @return {object} array || jQuery object
     */
    $.fn.pathvisiojs = function(option) {
      // Instantiate Pathvisiojs for all elements
      var $return = this.each(function() {
        var $this = $(this);
        var data = $this.data('pathvisiojs');
        var options = typeof option == 'object' && option;

        if (!data) {
          $this.data('pathvisiojs', (new Pathvisiojs(this, options)));
        }
      });

      if (option === 'get') {
        // Return an array of Pathvisiojs instances
        return $.map(this, function(a) {
          return $(a).data('pathvisiojs').getPublicInstance();
        });
      } else {
        // Return jQuery object
        return $return;
      }
    };
  }

  /**
   * Globally available method
   * Returns an array of public instances
   *
   * @param  {string} selector
   * @param  {object} option
   * @return {array}
   */
  window.pathvisiojs = function(selector, option) {
    var $elements;

    if (Utils.isElement(selector)) {
      $elements = [[selector]];
    } else {
      $elements = d3.selectAll(selector);
    }

    return _.map($elements[0], function(element) {
      if (element.data === undefined) {element.data = {};}

      var data;
      var options = typeof option == 'object' ? option : {};

      if (element.data.pathvisiojs === undefined) {
        element.data.pathvisiojs = (data = new Pathvisiojs(element, options));
      } else {
        data = element.data.pathvisiojs;
      }

      return data.getPublicInstance();
    });
  };
};

/**
 * Enable the wikipathways-pathvisiojs custom element
 *
 * @return
 */
function registerWikiPathwaysPathvisiojsElement() {
  'use strict';

  var DivPrototype = Object.create(window.HTMLDivElement.prototype);

  DivPrototype.attributeChangedCallback = function(
      attrName, oldValue, newValue) {
    if (attrName === 'alt') {
      this.textContent = newValue;
    }
  };

  var WikiPathwaysPathvisiojsPrototype = Object.create(DivPrototype);

  WikiPathwaysPathvisiojsPrototype.createdCallback = function() {
    var alt = this.getAttribute('alt');
    if (!!alt) {
      this.attributeChangedCallback('alt', null, alt);
    }

    var src = this.getAttribute('src');
    if (!!src) {
      this.attributeChangedCallback('src', null, src);
    }

    loadPathvisiojs(this);
  };

  // Public: WikiPathwaysPathvisiojsPrototype constructor.
  //
  //   Currently:
  //   var wikiPathwaysPathvisiojs = new WikiPathwaysPathvisiojsPrototype()
  //   # => <div is=wikipathways-pathvisiojs"></div>
  //
  //   We could consider setting it up like this, but
  //   then we would need to create the DIV box model ourselves.
  //   # => <wikipathways-pathvisiojs></wikipathways-pathvisiojs>
  //
  window.WikiPathwaysPathvisiojs = document.registerElement(
      'wikipathways-pathvisiojs', {
    prototype: WikiPathwaysPathvisiojsPrototype,
    extends: 'div'
  });

}

/**
 * Automatically load all wikipathways-pathvisiojs custom elements
 *
 * @param {object} el a wikipathways-pathvisiojs custom element
 * @return
 */
function loadPathvisiojs(el) {
  $(el).pathvisiojs({
    fitToContainer: Boolean(el.getAttribute('fit-to-container')),
    manualRender: Boolean(el.getAttribute('manual-render')),
    sourceData: [
      {
        uri: el.getAttribute('src'),
        // TODO we should be able to use the content type
        // header from the server response instead of relying
        // on this.
        // Think analogous to .png, .gif, etc. for the img tag.
        fileType:'gpml' // generally will correspond to filename extension
      }
    ]
  });

  // Get first element from array of instances
  var pathInstance = $(el).pathvisiojs('get').pop()
  window.pathInstance = pathInstance

  // Load notification plugin
  pathvisiojsNotifications(pathInstance, {
    displayErrors: Boolean(el.getAttribute('display-errors')),
    displayWarnings: Boolean(el.getAttribute('display-warnings'))
  });

  // Call after render
  pathInstance.on('rendered', function() {

    window.initPathvisiojsHighlighter(window, window.jQuery || window.Zepto);
    // Initialize Highlighter plugin
    var hi = pathvisiojsHighlighter(pathInstance)
    window.hi = hi

    // Highlight by ID
    hi.highlight('#eb5')
    hi.highlight('id:d25e1')

    // Highlight by Text
    hi.highlight('Mitochondrion', null, {backgroundColor: 'gray'})

    // Highlight by xref
    hi.highlight('xref:id:http://identifiers.org/wormbase/ZK1193.5', null, {
      backgroundColor: 'magenta', borderColor: 'black'})
    hi.highlight('xref:GCN-2', null, {
      backgroundColor: 'blue',
      backgroundOpacity: 0.5,
      borderColor: 'red',
      borderWidth: 1,
      borderOpacity: 0.7
    });

    var mySvg = $('#pvjs-diagram-1');
    mySvg.attr('width', '100%');
    highland('resize', $(window)).each(function() {
      console.log('child says resized');
      // TODO in pathvisiojs, set svg to resize
      // when the container changes in size.
      // also, make sure that the updates are throttled.
      // svgPanZoom.resize();
      mySvg.attr('width', '100%');
      mySvg.attr('height', '100%');
    });

  });

  // Call renderer
  pathInstance.render()

};

/*********************************
 * A very simple asset loader. It checks all
 * assets that could be loaded already. If they
 * are loaded already, great. Otherwise, it
 * loads them.
 *
 * It would be nice to use an
 * open-source library for this
 * to ensure it works x-browser.
 * Why did Modernizr/yepnope deprecate this
 * type of strategy?
 * ******************************/
var assetsToLoad = [
  {
    exposed: 'd3',
    type: 'script',
    url: '//cdnjs.cloudflare.com/ajax/libs/d3/3.4.6/d3.min.js',
    loaded: (function() {
      return !!window.d3;
    })()
  },
  {
    exposed: 'jQuery',
    type: 'script',
    url: '//cdnjs.cloudflare.com/ajax/libs/jquery/1.11.1/jquery.min.js',
    loaded: (function() {
      return !!window.jQuery;
    })()
  },
  {
    // TODO figure out the path for the jQuery typeahead.js
    // plugin, starting from window or document. We need it
    // to ensure the plugin has loaded.
    //exposed: '',
    type: 'script',
    url: '//cdnjs.cloudflare.com/ajax/libs/typeahead.js/0.10.2/' +
      'typeahead.bundle.min.js',
    loaded: (function() {
      return !!window.jQuery && !!window.jQuery('body').typeahead;
    })()
  },
  {
    exposed: 'Modernizr',
    type: 'script',
    url: '//cdnjs.cloudflare.com/ajax/libs/modernizr/2.8.3/modernizr.min.js',
    loaded: (function() {
      return !!window.Modernizr;
    })()
  },
  {
    exposed: 'document.registerElement',
    type: 'script',
    url: '//cdnjs.cloudflare.com/ajax/libs/webcomponentsjs/0.5.2/CustomElements.min.js',
    loaded: (function() {
      return !!document.registerElement;
    })()
  }
];

/**
 * Streaming version of promisescript
 *
 * @param {object} args
 * @param {string} args.exposed
 * @param {string} args.type script or style
 * @param {string} args.url
 * @return {stream}
 */
function loadAssetStreaming(args) {
  return highland(promisescript(args));
}

highland(assetsToLoad)
  .filter(function(asset) {
    return !asset.loaded;
  })
  .errors(function(err, push) {
    push(err);
  })
  .flatMap(loadAssetStreaming)
  .collect()
  .each(function(result) {
    console.log('result');
    console.log(result);
    initPathvisiojs(window, window.jQuery || null);
    registerWikiPathwaysPathvisiojsElement();
  });
