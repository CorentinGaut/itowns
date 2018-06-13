#include <precision_qualifier>
#include <project_pars_vertex>
#include <elevation_pars_vertex>
#include <logdepthbuf_pars_vertex>
#define EPSILON 1e-6

attribute float     uv_pm;
attribute vec2      uv_wgs84;
attribute vec3      normal;

uniform mat4        modelMatrix;

varying vec2        vUv_WGS84;
varying float       vUv_PM;
varying vec3        vNormal;


void main() {
        vec2 uv = vec2(uv_wgs84.x, 1.0 - uv_wgs84.y);

        #include <begin_vertex>
        #include <elevation_vertex>
        #include <project_vertex>
        #include <logdepthbuf_vertex>

        vUv_WGS84 = uv_wgs84;
        vUv_PM = uv_pm;
        vNormal = normalize ( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal );
}
