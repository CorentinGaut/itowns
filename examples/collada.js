/* global itowns, document, renderer, GuiTools, Promise */
// # Simple Globe viewer

// Define initial camera position
// Coordinate can be found on https://www.geoportail.gouv.fr/carte
// setting is "coordonnée geographiques en degres decimaux"

// Position near Annecy lake.
// var positionOnGlobe = { longitude: 6.2230, latitude: 45.8532, altitude: 5000 };

// Position near Gerbier mountain.
var positionOnGlobe = { longitude: 4.2202, latitude: 44.844, altitude: 2500 };

// `viewerDiv` will contain iTowns' rendering area (`<canvas>`)
var viewerDiv = document.getElementById('viewerDiv');

// Instanciate iTowns GlobeView*
var globeView = new itowns.GlobeView(viewerDiv, positionOnGlobe, { renderer: renderer });

var promises = [];

var menuGlobe = new GuiTools('menuDiv');

menuGlobe.view = globeView;

function addLayerCb(layer) {
    return globeView.addLayer(layer);
}
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

function addMeshToScene() {
    var model;
    // loading manager
    var loadingManager = new itowns.THREE.LoadingManager(function _addModel() {
        globeView.scene.add(model);
        globeView.notifyChange(true);
    });
    // collada
    var loader = new itowns.THREE.ColladaLoader(loadingManager);

    // get the position on the globe, from the camera
    var cameraTargetPosition = globeView.controls.getCameraTargetGeoPosition();

    // position of the mesh
    var meshCoord = cameraTargetPosition;
    meshCoord.setAltitude(cameraTargetPosition.altitude());

    loader.load('https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/sourceModels/Duck/Duck.dae', function col(collada) {
        var colladaID = globeView.mainLoop.gfxEngine.getUniqueThreejsLayer();

        model = collada.scene;
        model.position.copy(meshCoord.as(globeView.referenceCrs).xyz());
        model.lookAt(new itowns.THREE.Vector3(0, 0, 0));
        model.rotateX(-Math.PI * 0.5);
        model.translateY(-7);
        model.scale.set(0.5, 0.5, 0.5);

        // set camera's layer to do not disturb the picking
        model.traverse(function _(obj) { obj.layers.set(colladaID); });
        globeView.camera.camera3D.layers.enable(colladaID);

        // update coordinate of the mesh
        model.updateMatrixWorld();
    });
}

// Listen for globe full initialisation event
globeView.addEventListener(itowns.GLOBE_VIEW_EVENTS.GLOBE_INITIALIZED, function init() {
    // eslint-disable-next-line no-console
    console.info('Globe initialized');
    Promise.all(promises).then(function _() {
        menuGlobe.addImageryLayersGUI(globeView.getLayers(function cl(l) { return l.type === 'color'; }));
        menuGlobe.addElevationLayersGUI(globeView.getLayers(function el(l) { return l.type === 'elevation'; }));
        addMeshToScene();
        globeView.controls.setOrbitalPosition({ heading: 180, tilt: 60 });
    });
});
