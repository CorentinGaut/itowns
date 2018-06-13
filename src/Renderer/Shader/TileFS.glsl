#include <precision_qualifier>
#include <pitUV>
#include <logdepthbuf_pars_fragment>

// BUG CHROME 50 UBUNTU 16.04
// Lose context on compiling shader with too many IF STATEMENT
// runconformance/glsl/bugs/conditional-discard-in-loop.html
// conformance/glsl/bugs/nested-loops-with-break-and-continue.html
// Resolve CHROME unstable 52

const vec4 CFog = vec4( 0.76, 0.85, 1.0, 1.0);
const vec4 CWhite = vec4(1.0,1.0,1.0,1.0);
const vec4 COrange = vec4( 1.0, 0.3, 0.0, 1.0);
const vec4 CRed = vec4( 1.0, 0.0, 0.0, 1.0);


uniform sampler2D   dTextures_01[NUM_TEXTURES];
uniform vec4        offsetScale_L01[NUM_TEXTURES];

// offset texture | Projection | fx | Opacity
uniform vec4        paramLayers[NUM_LAYERS];
uniform int         loadedTexturesCount[NUM_LAYERS];
uniform bool        visibility[NUM_LAYERS];

uniform float       distanceFog;
uniform int         colorLayersCount;
uniform vec3        lightPosition;

uniform vec3        noTextureColor;

// Options global
uniform bool        selected;
uniform bool        lightingEnabled;

varying vec2        vUv_WGS84;
varying float       vUv_PM;
varying vec3        vNormal;

uniform float opacity;

vec4 applyWhiteToInvisibleEffect(vec4 color, float intensity) {
    float a = (color.r + color.g + color.b) * 0.333333333;
    color.a *= 1.0 - pow(abs(a), intensity);
    return color;
}

vec4 applyLightColorToInvisibleEffect(vec4 color, float intensity) {
    float a = max(0.05,1.0 - length(color.xyz - CWhite.xyz));
    color.a *= 1.0 - pow(abs(a), intensity);
    color.rgb *= color.rgb * color.rgb;
    return color;
}

#if defined(DEBUG)
    uniform bool showOutline;
    const float sLine = 0.008;
#endif

#if defined(MATTE_ID_MODE) || defined(DEPTH_MODE)
#include <packing>
uniform int  uuid;
#endif

vec4 getLayerColor(sampler2D texture,vec4 offsetScale, vec2 uv, vec4 param) {
    vec4 color = texture2D(texture, pitUV(uv, offsetScale));
    if(color.a > 0.0) {
        if(param.z > 2.0) {
            color.rgb /= color.a;
            color = applyLightColorToInvisibleEffect(color, param.z);
            color.rgb *= color.a;
        } else if(param.z > 0.0) {
            color.rgb /= color.a;
            color = applyWhiteToInvisibleEffect(color, param.z);
            color.rgb *= color.a;
        }
    }
    return color * param.w;
}


void main() {
    #include <logdepthbuf_fragment>

#if defined(MATTE_ID_MODE)

    gl_FragColor = packDepthToRGBA(float(uuid) / (256.0 * 256.0 * 256.0));

#elif defined(DEPTH_MODE)

  #if defined(USE_LOGDEPTHBUF) && defined(USE_LOGDEPTHBUF_EXT)
    float z = gl_FragDepthEXT ;
  #else
    float z = gl_FragCoord.z;
  #endif
    gl_FragColor = packDepthToRGBA(z);

#else

    // Reconstruct PM uv and PM subtexture id (see TileGeometry)
    vec2 uvWGS84 = vUv_WGS84;
    vec2 uvPM    = vUv_WGS84;
    float y      = floor(vUv_PM);
    uvPM.y       = vUv_PM - y;
    int pmSubTextureIndex = int(y);
    
    #if defined(DEBUG)
    if (showOutline) {
        if (uvWGS84.x < sLine || 1.0 - uvWGS84.x < sLine || uvWGS84.y < sLine || 1.0 - uvWGS84.y < sLine) {
            gl_FragColor = CRed;
            return;
        } else if (uvPM.x < sLine || 1.0 - uvPM.x < sLine || uvPM.y < sLine || 1.0 - uvPM.y < sLine) {
            gl_FragColor = COrange;
            return;
        }
    }
    #endif

    vec4 diffuseColor = vec4(noTextureColor, 1.0);
    for (int layer = 0; layer < NUM_LAYERS; layer++) {
        if(layer == colorLayersCount) {
            break;
        }
        vec4 param = paramLayers[layer];
        bool projWGS84 = param.y == 0.0;
        int pmTextureCount = int(param.y);
        vec4 layerColor = vec4(0.);
        if( visibility[layer] && param.w > 0.0 && (projWGS84 || pmSubTextureIndex < pmTextureCount) ) {
            vec2 uv = projWGS84 ? uvWGS84 : uvPM;
            int textureIndex = int(param.x) + (projWGS84 ? 0 : pmSubTextureIndex);
            #pragma unroll_loop
            for ( int i = 0; i < NUM_TEXTURES; i ++ ) {
                if ( textureIndex == i ) layerColor = getLayerColor(dTextures_01[ i ], offsetScale_L01[ i ], uv, param);
            }
            diffuseColor = layerColor + diffuseColor * (1.0 - layerColor.a);
        }
    }

    // Selected
    if(selected) {
        diffuseColor = mix(COrange, diffuseColor, 0.5 );
    }

    // Fog
    #if defined(USE_LOGDEPTHBUF) && defined(USE_LOGDEPTHBUF_EXT)
        float depth = gl_FragDepthEXT / gl_FragCoord.w;
    #else
        float depth = gl_FragCoord.z / gl_FragCoord.w;
    #endif
    float fogIntensity = 1.0/(exp(depth/distanceFog));
    gl_FragColor = mix(CFog, diffuseColor, fogIntensity);
    gl_FragColor.a = 1.0;

    if(lightingEnabled) {   // Add lighting
        float light = min(2. * dot(vNormal, lightPosition),1.);
        gl_FragColor.rgb *= light;
    }
    gl_FragColor.a = opacity;
    #endif
}
