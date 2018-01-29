/* global itowns, document, renderer */
// # Simple Globe viewer

// Define initial camera position
var positionOnGlobe = { longitude: 4.818, latitude: 45.7354, altitude: 30000000 };
var promises = [];
var meshes = [];
var scaler;

// `viewerDiv` will contain iTowns' rendering area (`<canvas>`)
var viewerDiv = document.getElementById('viewerDiv');

// Instanciate iTowns GlobeView*
var globeView = new itowns.GlobeView(viewerDiv, positionOnGlobe, { renderer: renderer });
function addLayerCb(layer) {
    return globeView.addLayer(layer);
}

// Define projection that we will use (taken from https://epsg.io/3946, Proj4js section)
itowns.proj4.defs('EPSG:3946',
    '+proj=lcc +lat_1=45.25 +lat_2=46.75 +lat_0=46 +lon_0=3 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
itowns.proj4.defs('EPSG:2154',
    '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Add one imagery layer to the scene
// This layer is defined in a json file but it could be defined as a plain js
// object. See Layer* for more info.
promises.push(itowns.Fetcher.json('./layers/JSONLayers/Ortho.json').then(addLayerCb));

// Add two elevation layers.
// These will deform iTowns globe geometry to represent terrain elevation.
promises.push(itowns.Fetcher.json('./layers/JSONLayers/WORLD_DTM.json').then(addLayerCb));
promises.push(itowns.Fetcher.json('./layers/JSONLayers/IGN_MNT_HIGHRES.json').then(addLayerCb));


exports.view = globeView;
exports.initialPosition = positionOnGlobe;

function resto_add(url, layer) {
    layer = layer || {}
    var uniforms = {
        alpha: {  type: "f", value: 0.5 }
    };
    var material = new itowns.THREE.RawShaderMaterial({
        uniforms,
        vertexShader: document.getElementById('vertexShader').textContent,
        fragmentShader: document.getElementById('fragmentShader').textContent,
		side : itowns.THREE.DoubleSide
    });
	material = undefined;
    layer.parse = layer.parse || itowns.GeoJSON2Features.parse;
    layer.convert = layer.convert || itowns.Feature2Mesh.convert({material, type:'linestring'});
    layer.crsOut = layer.crsOut || globeView.referenceCrs;
    function resto_add_features(json) {
		var features = layer.parse(layer.crsOut, json, layer.extent, { filter: layer.filter });
        var group = layer.convert(features);
		if(!group) return;
		var material = group.children.forEach(child => {
			child.material.transparent = true;
			child.material.opacity = 0.9;
		});
        group.features.forEach(feature => {
			if(!feature.properties.thumbnail) return;
			const { texture, promise } = itowns.Fetcher.texture(feature.properties.thumbnail);
			texture.generateMipmaps = false;
			texture.magFilter = THREE.LinearFilter;
			texture.minFilter = THREE.LinearFilter;
			texture.anisotropy = 16;
			child.material.texture = texture;
		});
		console.log(group.children[0].material);
        console.log(img);
        globeView.scene.add(group);
    };

    itowns.Fetcher.json(url+'collections.json', layer.networkOptions).then(json => {
        collections = json.collections;
        if(layer.collection) collections = collections.filter(c => c.name == layer.collection);
        collections.forEach(c => itowns.Fetcher.json(url+'api/collections/'+c.name+'/search.json').then(resto_add_features));
    });
}

// Listen for globe full initialisation event
globeView.addEventListener(itowns.GLOBE_VIEW_EVENTS.GLOBE_INITIALIZED, function () {
    // eslint-disable-next-line no-console
    console.info('Globe initialized');
    //resto_add("https://theia.cnes.fr/atdistrib/resto2/", {collection: "SENTINEL2"});
    //resto_add("resto/", {collection: "SENTINEL2"});
    //resto_add("https://peps.cnes.fr/resto/");
    resto_add("https://finder.eocloud.eu/resto/");

    Promise.all(promises).then(function () {
    });
});
