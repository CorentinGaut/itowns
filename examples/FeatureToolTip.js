/* global itowns, document */
// eslint-disable-next-line no-unused-vars
function ToolTip(viewer, viewerDiv, tooltip, precisionPx, clickCallback) {
    var mouseDown = 0;
    var layers = viewer.getLayers(function _(l) { return l.protocol === 'rasterizer'; });

    document.body.onmousedown = function onmousedown() {
        ++mouseDown;
    };
    document.body.onmouseup = function onmouseup() {
        --mouseDown;
    };

    function buildToolTip(geoCoord, e) {
        var visible = false;
        var precision = viewer.controls.pixelsToDegrees(precisionPx || 5);
        var i = 0;
        var p = 0;
        var id = 0;
        var layer;
        var result;
        var properties;
        var color;
        var stroke;
        var name;
        var symb;
        var label;
        var coordinates;
        // var
        tooltip.innerHTML = '';
        tooltip.style.visibility = 'hidden';
        if (geoCoord) {
            visible = false;
            // convert degree precision
            for (i = 0; i < layers.length; i++) {
                layer = layers[i];
                result = itowns.FeaturesUtils.filterFeaturesUnderCoordinate(
                    geoCoord, layer.feature, precision);
                result.sort(function compare(a, b) { return b.type !== 'point'; });
                for (p = 0; p < result.length; p++) {
                    visible = true;
                    properties = result[p].properties;
                    ++id;
                    name = 'tooltip_'  + id;
                    label = properties.name|| properties.title || properties.nom || properties.description || layer.name;
                    if (result[p].type === 'polygon') {
                        color = properties.fill || layer.style.fill;
                        stroke = properties.stroke || layer.style.stroke;
                        symb = '<span id=' + name + ' >&#9724</span>';
                        img = properties.thumbnail ? '<img src="' + properties.thumbnail + '" height="256px"/><br />' : "";
                        tooltip.innerHTML += symb + ' ' + label + '<br />' + img;
                        document.getElementById(name).style['-webkit-text-stroke'] = '1.25px ' + stroke;
                        document.getElementById(name).style.color = color;
                    } else if (result[p].type === 'linestring') {
                        color = properties.stroke || layer.style.stroke;
                        symb = '<span id=' + name + ' style=color:' + color + ';>&#9473</span>';
                        tooltip.innerHTML += symb + ' ' + label + '<br />';
                    } else if (result[p].type === 'point') {
                        coordinates = result[p].coordinates;
                        color = 'white';
                        symb = '<span id=' + name + ' style=color:' + color + ';>&#9679</span>';
                        tooltip.innerHTML += '<div>' + symb + ' ' + label + '<br></div>';
                        tooltip.innerHTML += '<span class=coord>long ' + coordinates.longitude().toFixed(4) + '<br /></span>';
                        tooltip.innerHTML += '<span class=coord>lati &nbsp; ' + coordinates.latitude().toFixed(4) + '<br /></span>';
                        document.getElementById(name).style['-webkit-text-stroke'] = '1px red';
                    }
                }
            }
            if (visible) {
                tooltip.style.left = e.pageX + 'px';
                tooltip.style.top = e.pageY + 'px';
                tooltip.style.visibility = 'visible';
            }
        }
    }

    function readPosition(e) {
        if (!mouseDown) {
            buildToolTip(viewer.controls.pickGeoPosition(e.clientX, e.clientY), e);
        } else {
            tooltip.style.left = e.pageX + 'px';
            tooltip.style.top = e.pageY + 'px';
        }
    }

    function pickPosition(e) {
  //      buildToolTip(viewer.controls.pickGeoPosition(e.clientX, e.clientY), e);
    }

    function clickPosition(e) {
        var geoCoord = viewer.controls.pickGeoPosition(e.clientX, e.clientY);
        var layer, result;
        if (clickCallback && geoCoord) {
            var precision = viewer.controls.pixelsToDegrees(precisionPx || 5);
            for (i = 0; i < layers.length; i++) {
                layer = layers[i];
                result = itowns.FeaturesUtils.filterFeaturesUnderCoordinate(
                    geoCoord, layer.feature, precision);
                result.sort(function compare(a, b) { return b.type !== 'point'; });
                for (p = 0; p < result.length; p++) {
                    clickCallback(result[p]);
                }
            }
        }
    }

    document.addEventListener('mousemove', readPosition, false);
    document.addEventListener('mousedown', pickPosition, false);
    document.addEventListener('click', clickPosition, false);
}

