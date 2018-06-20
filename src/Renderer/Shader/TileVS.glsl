#include <itowns.precision_qualifier>
#include <itowns.project_pars_vertex>
#include <itowns.elevation_pars_vertex>
#include <proj4.geocent_t>
#include <proj4.geocent_inverse>
#include <proj4.geocent_forward>
#include <logdepthbuf_pars_vertex>
#define EPSILON 1e-6

attribute float     uv_pm;
attribute vec2      uv_wgs84;
attribute vec3      normal;

uniform mat4        modelMatrix;

varying vec3        vUv;
varying vec3        vNormal;

void main() {
        vec2 uv = vec2(uv_wgs84.x, 1.0 - uv_wgs84.y);

        #include <begin_vertex>
        #include <itowns.elevation_vertex>
        #include <project_vertex>
        #include <logdepthbuf_vertex>

        vec4 world = modelMatrix * vec4( transformed, 1.0 );
        vec3 p_geocent = world.xyz / world.w;
        vec2 p_wgs84;
        geocent_inverse(geocent, p_geocent, p_wgs84);
        // geocent_forward(geocent, p_wgs84, p_geocent);

        // vUv = world;
        vUv = vec3(p_wgs84, 0);

        // vUv = lcc_forward(geocent, world.xyz / world.w);

        // return PI - log(tan(PI_OV_FOUR + vUv.y * 0.5));
        // return 0.5 - Math.log(Math.tan(PI_OV_FOUR + MathExt.degToRad(latitude) * 0.5)) * INV_TWO_PI;

        vNormal = normalize ( mat3( modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz ) * normal );
}
