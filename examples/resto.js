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

function resto_add_feature(feature) {
    console.log(feature.properties.quicklook);
    console.log(feature.properties.thumbnail);
    console.log(feature.geometry);
}
    
function resto_add(url, options) {
    options = options || {}
    itowns.Fetcher.json(url+'collections.json').then(json => {
        collections = json.collections;
        if(options.collection) collections = collections.filter(c => c.name == options.collection);
        collections.forEach(c => 
            itowns.Fetcher.json(url+'api/collections/'+c.name+'/search.json').then(json =>
                json.features.forEach(resto_add_feature)
            )
        );
    });
}
//
/*
    
    
    // creation of the new mesh (a cylinder)
    var THREE = itowns.THREE;
    var geometry = new THREE.CylinderGeometry(0, 10, 60000, 8);
    var material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    var mesh = new THREE.Mesh(geometry, material);

    // get the position on the globe, from the camera
    var cameraTargetPosition = globeView.controls.getCameraTargetGeoPosition();

    // position of the mesh
    var meshCoord = cameraTargetPosition;
    meshCoord.setAltitude(cameraTargetPosition.altitude() + 30);

    // position and orientation of the mesh
    mesh.position.copy(meshCoord.as(globeView.referenceCrs).xyz());
    mesh.lookAt(new THREE.Vector3(0, 0, 0));
    mesh.rotateX(Math.PI / 2);

    // update coordinate of the mesh
    mesh.updateMatrixWorld();

    // add the mesh to the scene
    globeView.scene.add(mesh);

    // make the object usable from outside of the function
    globeView.mesh = mesh;
    console.info('mesh added');
}
*/
// Listen for globe full initialisation event
globeView.addEventListener(itowns.GLOBE_VIEW_EVENTS.GLOBE_INITIALIZED, function () {
    // eslint-disable-next-line no-console
    console.info('Globe initialized');
    //resto_add("https://theia.cnes.fr/atdistrib/resto2/", {collection: "SENTINEL2"});
    resto_add("resto/", {collection: "SENTINEL2"});
    Promise.all(promises).then(function () {
    });
});
