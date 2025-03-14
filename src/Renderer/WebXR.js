import * as THREE from 'three';
import { XRButton } from 'three/addons/webxr/XRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import OrientationUtils from 'Utils/OrientationUtils.js';

async function shutdownXR(session) {
    if (session) {
        await session.end();
    }
}

function initializeController(view, controllerModelFactory, id) {
	const xr = view.renderer.xr;
	const controller = xr.getController( id );
	//controller.addEventListener( 'selectstart', onSelectStart );
	//controller.addEventListener( 'squeezestart', onSqueezeStart );
	//controller.addEventListener( 'selectend', onSelectEnd );	
	controller.addEventListener( 'connected', ( event ) => {
		if (event.data.handedness == "left" ){
			//do something here
			console.log(event);
		}
		if (event.data.handedness == "right" ){
			//do something here
			console.log(event);
		}
		//get buttons inputs from controller 1
		controller.gamepad = event.data.gamepad;
	});
	const controllerGrip = xr.getControllerGrip( id );
	controllerGrip.add( controllerModelFactory.createControllerModel( controllerGrip ) );
	view.scene.add( controllerGrip );
	view.scene.add( controller );
	return controller;
}

function setSceneOrigin(view, coords, scale) 
{
	const scene = view.scene;
	const crs = view.referenceCrs;
	scene.quaternion.set(-1, 0, 0, 1).normalize();    
	scene.quaternion.multiply(OrientationUtils.quaternionFromCRSToEnu(crs,coords));
        coords.as(crs).toVector3(scene.position).multiplyScalar(-scale).applyQuaternion(scene.quaternion);
        scene.scale.set(scale, scale, scale);
        scene.updateMatrixWorld();
}

const initializeWebXR = (view, options) => {
    const scale = options.scale || 1.0;

    const xr = view.mainLoop.gfxEngine.renderer.xr;
    
    const controllerModelFactory = new XRControllerModelFactory();
    const controller1 = initializeController(view, controllerModelFactory, 0);
    const controller2 = initializeController(view, controllerModelFactory, 1);
    const renderer = view.renderer;
    const scene = view.scene;

	const geometry = new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 1000 ) ] );

	const line = new THREE.Line( geometry );
	line.name = 'line';
	line.scale.z = 100;

	controller1.add( line.clone() );
	controller2.add( line.clone() );


    xr.addEventListener('sessionstart', () => {
        const camera = view.camera.camera3D;

        const exitXRSession = (event) => {
            if (event.key === 'Escape') {
                document.removeEventListener('keydown', exitXRSession);
                xr.enabled = false;
                view.camera.camera3D = camera;
		view.scene.position.set(0,0,0);
		view.scene.quaternion.identity();
                view.scene.scale.multiplyScalar(1 / scale);
                view.scene.updateMatrixWorld();
                shutdownXR(xr.getSession());
                view.notifyChange(view.camera.camera3D, true);
            }
        };
	const coords = view.camera.position().as('EPSG:4326');
	setSceneOrigin(view, coords, scale);
        xr.enabled = true;
        xr.getReferenceSpace('local');

        const trans =  new THREE.Vector3(0, 0, 0);
        const quat2 =  new THREE.Quaternion(0, 0, 0, 1);
        const transform = new XRRigidTransform(trans, quat2);

        const baseReferenceSpace = xr.getReferenceSpace();
        const teleportSpaceOffset = baseReferenceSpace.getOffsetReferenceSpace(transform);
        xr.setReferenceSpace(teleportSpaceOffset);

        view.camera.camera3D = xr.getCamera();
        view.camera.resize(view.camera.width, view.camera.height);


	const c = coords.as('EPSG:2154');
	function controllergamepad(dt) {
		const v = 10;
		coords.as('EPSG:2154', c);
		if (controller1.gamepad && controller1.gamepad.axes) {
			const axes = controller1.gamepad.axes;
			if (axes[2]*axes[2] > 0.01) c.x += v*axes[2];
			if (axes[3]*axes[3] > 0.01) c.y -= v*axes[3];
		}
		if (controller2.gamepad && controller2.gamepad.axes) {
			const axes = controller2.gamepad.axes;
			if (axes[3]*axes[3] > 0.01) c.z -= v*axes[3];
		}
		c.as('EPSG:4326', coords);
	}

        // TODO Fix asynchronization between xr and MainLoop render loops.
        // (see MainLoop#scheduleViewUpdate).
        xr.setAnimationLoop((timestamp) => {
            if (xr.isPresenting && view.camera.camera3D.cameras[0]) {
                controllergamepad();
            	setSceneOrigin(view, coords, scale);
                view.scene.updateMatrixWorld();
                view.camera.camera3D.updateMatrix();
                view.camera.camera3D.updateMatrixWorld(true);
                view.notifyChange(view.camera.camera3D, true);                
            }

            view.mainLoop.step(view, timestamp);
        });
        
        
        //view.addFrameRequester(itowns.MAIN_LOOP_EVENTS.BEFORE_RENDER, controllergamepad);
        document.addEventListener('keydown', exitXRSession, false);
    });
};

export default initializeWebXR;


