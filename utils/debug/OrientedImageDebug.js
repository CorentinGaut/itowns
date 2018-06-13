import { Group, CameraHelper, AxesHelper } from 'three';

function createAxisHelpers(poses, visible, size = 0.5) {
    const helpers = new Group();
    helpers.visible = visible;
    for (const pose of poses) {
        const helper = new AxesHelper(size);
        helper.position.copy(pose.position);
        helper.quaternion.copy(pose.quaternion);
        helpers.add(helper);
    }
    return helpers;
}

function createCameraHelpers(cameras, visible) {
    var helpers = new Group();
    helpers.visible = visible;
    for (const camera of cameras) {
        const helper = new CameraHelper(camera);
        helpers.add(helper);
    }
    return helpers;
}

export default {
    initTools(view, layer, datUi) {
        layer.axisHelpers = createAxisHelpers(layer.poses, layer.axisHelpers);
        layer.material.helpers = createCameraHelpers(layer.cameras, layer.cameraHelpers);
        layer.object3d.add(layer.material.helpers);
        layer.object3d.add(layer.axisHelpers);
        layer.object3d.updateMatrixWorld(true);

        var update = () => view.notifyChange(true);
        function updateCamera() {
            const camera = this.object.isCamera ? this.object : this.object.camera;
            if (this.object === camera) {
                camera.updateProjectionMatrix();
                layer.material.helpers.traverse(helper => helper.camera === camera && helper.update());
            } else if (this.object === camera.quaternion) {
                this.object.normalize();
            }
            camera.needsUpdate = true;
            layer.material.group.updateMatrixWorld(true);
            layer.material.helpers.updateMatrixWorld(true);
            view.notifyChange(true);
        }
        layer.debugUI = datUi.addFolder(`${layer.id}`);

        const axisUI = layer.debugUI.addFolder('Axes');
        axisUI.add(layer.axisHelpers, 'visible').name('Display Axis Helpers').onChange(update);

        const camerasUI = layer.debugUI.addFolder('Cameras');
        camerasUI.add(layer.material.helpers, 'visible').name('Display Camera Helpers').onChange(update);
        for (const camera of layer.cameras) {
            const cameraUI = camerasUI.addFolder(camera.name);

            const intrinsicsUI = cameraUI.addFolder('Intrinsics');
            intrinsicsUI.add(camera, 'zoom').min(0).max(2).onChange(updateCamera);
            intrinsicsUI.add(camera, 'near').min(0.1).max(10).onChange(updateCamera);
            intrinsicsUI.add(camera, 'far').min(0.1).max(1000).onChange(updateCamera);
            intrinsicsUI.add(camera, 'skew').min(-100).max(100).onChange(updateCamera);

            const positionUI = cameraUI.addFolder('Position');
            camera.position.camera = camera;
            positionUI.add(camera.position, 'x').min(-1).max(1).onChange(updateCamera);
            positionUI.add(camera.position, 'y').min(-1).max(1).onChange(updateCamera);
            positionUI.add(camera.position, 'z').min(-1).max(1).onChange(updateCamera);

            const quaternionUI = cameraUI.addFolder('Quaternion');
            camera.quaternion.camera = camera;
            quaternionUI.add(camera.quaternion, 'x').min(-1).max(1).onChange(updateCamera);
            quaternionUI.add(camera.quaternion, 'y').min(-1).max(1).onChange(updateCamera);
            quaternionUI.add(camera.quaternion, 'z').min(-1).max(1).onChange(updateCamera);
            quaternionUI.add(camera.quaternion, 'w').min(-1).max(1).onChange(updateCamera);
        }
    },
};
