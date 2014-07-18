(function(window, $){

  var optionsDefault = {
    displayInputField: true
  , autocompleteLimit: 10
  , styles: {
      fill: 'yellow'
    , 'fill-opacity': 0.2
    , stroke: 'orange'
    , 'stroke-width': '3px'
    , 'stroke-opacity': 1
    }
  }

  /**
   * Init plugin
   *
   * @param {pathvisiojs instance} pvjs
   */
  function PathvisiojsHighlighter(pvjs, options) {
    var self = this
      , highlighter = {
          pvjs: pvjs
        , instance: self
        , options: extend(options || {}, optionsDefault)
        , elements: pvjs.getSourceData().pvjson.elements
        , searcheableValues: getSearcheableValues(pvjs.getSourceData().pvjson.elements)
        , groups: {}
        }

    // Only if jQuery is available
    if (highlighter.options.displayInputField && $) {
      initInputField(highlighter)
    }

    highlighter.publicInstance = {
      highlight: function(selector, group, styles) {
        nodes = select(highlighter, selector) // returns a d3 selection

        // Highlight all nodes one by one
        if (nodes) {
          // If is instance of D3
          if (typeof nodes.html === 'function') {
            nodes.each(function(){
              highlight(highlighter, group || 'default', this, styles)
            })
          } else {
            nodes.forEach(function(node){
              highlight(highlighter, group || 'default', node, styles)
            })
          }
        }

        // If anything highlighted then return true
        return !!nodes
      }
    , attenuate: function(selector, group) {
        if (selector) {
          nodes = select(highlighter, selector) // returns a d3 selection

          // Attenuate all nodes one by one
          if (nodes) {
            // If is instance of D3
            if (typeof nodes.html === 'function') {
              nodes.each(function(){
                attenuate(highlighter, group || 'default', this)
              })
            } else {
              nodes.forEach(function(node){
                attenuate(highlighter, group || 'default', node)
              })
            }
          }
        } else {
          // Attenuate all elements from group
          attenuate(highlighter, group || 'default')
        }
      }
    }

    return highlighter.publicInstance
  }

  function initInputField(highlighter) {
    // Currently works only with svg renderer
    if (highlighter.pvjs.getSourceData().rendererEngine !== 'svg') {
      return;
    }

    // Init dom elements
    highlighter.$element = $('<div class="pathvisiojs-highlighter"/>').appendTo($(highlighter.pvjs.$element[0][0]))
    highlighter.$input = $('<input type="text"/>').appendTo(highlighter.$element)
      .attr('placeholder', 'Enter node name to highlight')
      .attr('class', 'highlighter-input')
    highlighter.$inputReset = $('<i class="highlighter-remove"/>').appendTo(highlighter.$element)

    // Typeahead
    highlighter.$input.typeahead({
      minLength: 1
    , highlight: true
    }, {
      displayKey: 'val'
    , source: function(query, cb) {
        cb(filterSearcheableValues(highlighter.searcheableValues, query, highlighter.options.autocompleteLimit))
      }
    })

    function updateTypeaheadHighlight(differentColor) {
      differentColor = differentColor || false
      var styles = differentColor ? {fill: 'blue'} : {}

      highlighter.publicInstance.attenuate(null, 'typeahead')

      if (highlighter.publicInstance.highlight(highlighter.$input.val(), 'typeahead', styles)) {
        highlighter.$inputReset.addClass('active')
      } else {
        highlighter.$inputReset.removeClass('active')
      }
    }

    highlighter.$input
      .on('typeahead:selected typeahead:closed', function(ev, suggestion) {
        updateTypeaheadHighlight()
      })
      .on('typeahead:autocompleted typeahead:cursorchanged', function(ev, suggestion) {
        updateTypeaheadHighlight(true)
      })
      .on('keypress', function(ev){
        if (ev.keyCode && ev.keyCode === 13) {
          highlighter.$input.typeahead('close')

          updateTypeaheadHighlight()
        }
      })

    // Remove all typeahead highlights
    highlighter.$inputReset.on('click', function(){
      highlighter.$input.val('')
      highlighter.publicInstance.attenuate(null, 'typeahead')
      highlighter.$inputReset.removeClass('active')
    })
  }

  function getSearcheableValues(elements) {
    var searcheableValues = []

    if (elements && elements.length) {
      elements
        .filter(function(element) {return element['gpml:element'] === 'gpml:DataNode' || element['gpml:element'] === 'gpml:Label'})
          .forEach(function(node) {
            if (node.hasOwnProperty('textContent')) {

              var text = node.textContent.replace(/\n/g, ' ')
              searcheableValues.push({
                val: text
              , valLower: text.toLowerCase()
              , xref: node.datasourceReference ? node.datasourceReference.id : ''
              , node: node
              })
            }
          })
    }
    return searcheableValues
  }

  function filterSearcheableValues(searcheableValues, query, limit) {
    var filteredValues = []
      , filteredTitles = []
      , queryLower = query.toLowerCase()
      , limit = limit || 10

    // Search for strings that match from first letter
    for (var i = 0; i < searcheableValues.length; i++) {
      if (filteredValues.length >= limit) break;
      if (searcheableValues[i].valLower.indexOf(queryLower) === 0) {
        // Add only if is not duplicated
        if (filteredTitles.indexOf(searcheableValues[i].valLower) === -1) {
          filteredValues.push(searcheableValues[i])
          filteredTitles.push(searcheableValues[i].valLower)
        }
      }
    }

    // Search for strings that match from any position
    if (filteredValues.length < limit) {
      for (var i = 0; i < searcheableValues.length; i++) {
        if (filteredValues.length >= limit) break;
        // Search for all except those that start with that string as they were added previously
        if (searcheableValues[i].valLower.indexOf(queryLower) > 0) {
          // Add only if is not duplicated
          if (filteredTitles.indexOf(searcheableValues[i].valLower) === -1) {
            filteredValues.push(searcheableValues[i])
            filteredTitles.push(searcheableValues[i].valLower)
          }
        }
      }
    }
    return filteredValues
  }

  function getPvjsElementById(elements, id) {
    for (i = elements.length - 1; i >=0; i--) {
      if (elements[i].id != null && elements[i].id === id) {
        return elements[i]
      }
    }
    return null
  }

  function select(highlighter, selector) {
    var d3Selector = null
      , elementSelector = null

    if (selector[0] === '#') {
      // Select by id
      d3Selector = selector
      elementSelector = selector
    } else if(selector.indexOf('xref:') === 0) {
      // Search by xref

      var d3Selectors = []
        , selectorId = selector.substr(5)

      highlighter.searcheableValues.forEach(function(searcheableValue){
        if (searcheableValue.xref === selectorId) {
          if (searcheableValue.node.id) {
            d3Selectors.push('#'+searcheableValue.node.id)
          }
        }
      })

      d3Selector = d3Selectors.join(', ')
    } else {
      // Search as text

      var d3Selectors = []
        , selectorLower = selector.toLowerCase()

      highlighter.searcheableValues.forEach(function(searcheableValue){
        if (searcheableValue.valLower === selectorLower) {
          if (searcheableValue.node.id) {
            if (searcheableValue.node.shape === 'none' && !!searcheableValue.node.textContent) {
              d3Selectors.push('#text-for-' + searcheableValue.node.id)
            } else {
              d3Selectors.push('#' + searcheableValue.node.id)
            }
          }
        }
      })

      d3Selector = d3Selectors.join(', ')
    }

    if (!d3Selector) {
      return null
    } else {
      var nodes = highlighter.pvjs.$element.selectAll(d3Selector)

      if (!nodes.empty()) {
        return highlighter.pvjs.$element.selectAll(d3Selector)
      } else {
        return searchTroughElements(highlighter, elementSelector)
      }
    }
  }

  function searchTroughElements(highlighter, selector) {
    if (selector[0] === '#') {
      // Select by id
      var _selector = selector.slice(1)

      return highlighter.elements.filter(function(element){
        return element.id == _selector
      })
    } else {
      return null
    }
  }

  /**
   * Highlight a node. Set it into a group
   *
   * @param  {object} highlighter
   * @param  {string} group       Group name
   * @param  {object} node        pvjson.elment object
   */
  function highlight(highlighter, group, node, styles) {
    var options = highlighter.options
    styles = extend(styles || {}, options.styles)

    // Create group if it does not exist
    if (highlighter.groups[group] === undefined) {
      highlighter.groups[group] = []
    }

    // Check if node is not allready highlighted
    var g, h, light
      , highlighting = null

    // If in the same group
    for (h in highlighter.groups[group]) {
      light = highlighter.groups[group][h]

      if (light.node === node) {
        // Return as node is allready highlighted in the same group
        return;
      }
    }

    for (g in highlighter.groups) {
      for (h in highlighter.groups[g]) {
        light = highlighter.groups[g][h]

        if (light.node === node) {
          highlighting = light.highlighting
          break
        }
      }
    }

    // Render highlighting
    if (!highlighting) {
      if (isElement(node)) {
        var $node = d3.select(node)
          , nodeName = $node.property('nodeName')
          , pvjsElement = getPvjsElementById(highlighter.elements, $node.attr('id'))

        if (pvjsElement && pvjsElement['gpml:element'] === 'gpml:Interaction') { // Clone this path and set different stroke and fill
          var $parent = d3.select(node.parentNode)
            , attributes = node.attributes
            , highlighting = $parent.append(nodeName).attr('id', $node.attr('id') + '9')

          for (var i = 0; i < attributes.length; i++) {
            if (attributes[i].name === 'id') continue;

            highlighting.attr(attributes[i].name, attributes[i].value)
          }

          // Recalculate style
          _styles = extend(styles, {})

          // Adjust stroke-width
          if ($node.attr('stroke-width') == null) {
            _styles['stroke-width'] = options['stroke-width']
          } else {
            _styles['stroke-width'] = ((parseInt($node.attr('stroke-width'), 10) || 0) + (parseInt(options.styles['stroke-width'], 10) || 0)) + 'px'
          }

          // Adjust stroke-opacity
          _styles['stroke-opacity'] = Math.min(0.5, _styles['stroke-opacity'])

          highlighting
            .attr('style', generateStyleString(_styles, ['fill']) + 'pointer-events: none')

          // Adjust markers
          adjustMarkers(highlighter, highlighting, _styles)

        } else { // Treat element as a rectangle
          // Render node
          var nodeBBox = node.getBBox()
            // TODO take in account padding based on border width and offset
            , padding = 2.5
            , transform = node.getAttribute('transform')
            , translate
            , translate_x = 0
            , translate_y = 0

          // If node has translate attribute
          if (transform && (translate = transform.match(/translate\(([\d\s\.]+)\)/))) {
            translate = translate[1].split(' ')
            translate_x = +translate[0]
            translate_y = translate.length > 1 ? +translate[1] : 0
          }

          highlighting = highlighter.pvjs.$element.select('#viewport')
            .append('rect')
              .attr('x', nodeBBox.x - padding + translate_x)
              .attr('y', nodeBBox.y - padding + translate_y)
              .attr('width', nodeBBox.width + 2 * padding)
              .attr('height', nodeBBox.height + 2 * padding)
              .attr('class', 'highlighted-node')
              .attr('style', generateStyleString(styles) + 'pointer-events: none')
        }
      } else {
        // Is pvjson element
        if (node.height && node.width && node.x && node.y) {
          highlighting = highlighter.pvjs.$element.select('#viewport')
            .append('rect')
              .attr('x', node.x)
              .attr('y', node.y)
              .attr('width', node.width)
              .attr('height', node.height)
              .attr('class', 'highlighted-node')
              .attr('style', generateStyleString(styles) + 'pointer-events: none')
        }
      }
    } else {
      // Apply new style
      highlighting.attr('style', styleString + 'pointer-events: none')
    }

    // Add info to group
    if (highlighting) {
      highlighter.groups[group].push({
        node: node
      , highlighting: highlighting
      })
    }
  }

  function isElement(o){
    return (
      typeof HTMLElement === "object" ? (o instanceof HTMLElement || o instanceof SVGElement || o instanceof SVGSVGElement) : //DOM2
      o && typeof o === "object" && o !== null && o.nodeType === 1 && typeof o.nodeName==="string"
    );
  }


  function generateStyleString(styles, except) {
    var styleString = ''

    if (except == void 0) {
      except = []
    }

    for (var s in styles) {
      if (except.indexOf(s) === -1) {
        styleString += s + ':' + styles[s] + ';'
      }
    }

    return styleString
  }

  function adjustMarkers(highlighter, highlighting, styles) {
    adjustMarker(highlighter, highlighting, styles, 'marker-start')
    adjustMarker(highlighter, highlighting, styles, 'marker-mid')
    adjustMarker(highlighter, highlighting, styles, 'marker-end')
  }

  function adjustMarker(highlighter, $highlighting, styles, markerType) {
    var markerAttr = $highlighting.attr(markerType)
    if (markerAttr == null || markerAttr.match(/url\(\#(.*)\)/) == null) {
      return
    }

    var markerId = markerAttr.match(/url\(\#(.*)\)/)[1]
      , newColorId = styles.stroke.replace(/[^a-z0-9]/gmi, '') // replace all non alphanumeric chars
      , newId = markerId.split('-').slice(0, -1).join('-') + '-' + newColorId
      , $defs = highlighter.pvjs.$element.select('defs')

    // Create if such marker does not exist
    if ($defs.select('#' + newId).empty()) {
      var $originalMarker = highlighter.pvjs.$element.select('#' + markerId)
        , newMarker = $originalMarker.node().cloneNode(true)
        , $newMarker = d3.select(newMarker)
        , $newMarkerGroup = $newMarker.select('g')
        , $newMarkerShape = $newMarker.select('polygon')
        , $newMarkerRect = $newMarker.select('rect')

      $newMarker
        .attr('id', newId)
        .attr('markerUnits', 'userSpaceOnUse') // Force arrow to keep its sizes

      $newMarkerGroup.attr('id', $newMarkerGroup.attr('id').split('-').slice(0, -1).join('-') + '-' + newColorId)
      $newMarkerShape
        .attr('fill', styles.stroke)
        .attr('fill-opacity', styles['stroke-opacity'])
      $newMarkerRect.attr('stroke-width', styles['stroke-width'])

      // Append new marker to defs
      $defs.node().appendChild(newMarker)
    }


    $highlighting.attr(markerType, 'url(#' + newId + ')')
  }

  /**
   * Remove the whole group if node is not provided
   * Remove only given node if it is provided
   *
   * @param  {object} highlighter
   * @param  {string} group       group name
   * @param  {object} node        pvjson.element node
   */
  function attenuate(highlighter, group, node) {
    if (highlighter.groups[group] === undefined || !highlighter.groups[group].length) {
      return;
    }

    // Shorthand
    var _group = highlighter.groups[group]

    for (var i = _group.length - 1; i >= 0; i--) {
      // If nodes doesn't match move on
      if (node && _group[i].node !== node) {
        continue;
      }

      // Remove highlighting
      _group[i].highlighting.remove()

      // Remove node from all groups
      removeNode(highlighter, _group[i].node)
    }
  }

  /**
   * Removes node from all groups
   * @param  {[type]} highlighter [description]
   * @param  {[type]} node        [description]
   * @return {[type]}             [description]
   */
  function removeNode(highlighter, node) {
    var g, _group, h, light

    for (g in highlighter.groups) {
      _group = highlighter.groups[g]

      for (h in _group) {
        light = _group[h]

        if (light.node === node) {
          _group.splice(h, 1)
          break; // Go to next group
        }
      }
    }
  }

  /**
   * Utilities
   */

  function extend(o1, o2) {
    for (var i in o2) {
      if (Object.prototype.toString.apply(o2[i]) == '[object Object]') {
        o1[i] = extend(o1[i] || {}, o2[i])
      } else if (o2.hasOwnProperty(i) && !o1.hasOwnProperty(i)) {
        o1[i] = o2[i]
      }
    }
    return o1
  }

  /**
   * Expose plugin globally
   */
  window.pathvisiojsHighlighter = PathvisiojsHighlighter
})(window, window.jQuery || null)
