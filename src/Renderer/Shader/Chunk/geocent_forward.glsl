const float DEG_TO_RAD = 3.141592653589793 / 180.;

void geocent_forward(in geocent_t t, in vec3 p, out vec3 geocent) {
  p.xy       *= DEG_TO_RAD;
  vec4 sincos = vec4(sin(p.xy), cos(p.xy)); // sinlat, sinlon, coslat, coslon
  float N     = t.ab[0] / sqrt(1.0-t.e2*sincos.x*sincos.x);
  p.z        += N;
  geocent.xy  = sincos.z * sincos.yw * p.z;
  geocent.z   = sincos.x * (p.z - t.e2 * N);
  geocent     = t.p0.xyz + t.p0.w * geocent;
}

void geocent_forward(in geocent_t t, in vec2 p, out vec3 xyz) {
  geocent_forward(t, vec3(p,0), xyz);
}
