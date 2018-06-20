const float RAD_TO_DEG = 180. / 3.141592653589793;

void geocent_inverse(in geocent_t t, in vec3 p, out vec3 latlonalt) {
  p = (p - t.p0.xyz) / t.p0.w;
  float lengthxy = length(p.xy);
  vec4 r = vec4(p, lengthxy);
  vec2 sincos = normalize(r.zw * t.ab);
  r.zw += t.gf * sincos * sincos * sincos;
  latlonalt.xy = RAD_TO_DEG * atan(r.yw, r.xz);

  // altitude
  latlonalt.z = length(r.zw);
  r.w *= t.sqrt_one_e2;
  latlonalt.z *= lengthxy/r.z - t.ab[0]/length(r.zw);
}


void geocent_inverse(in geocent_t t, in vec3 p, out vec2 latlon) {
  p = (p - t.p0.xyz) / t.p0.w;
  vec4 r = vec4(p, length(p.xy));
  vec2 sincos = normalize(r.zw * t.ab);
  r.zw += t.gf * sincos * sincos * sincos;
  latlon = RAD_TO_DEG * atan(r.yw, r.xz);
}
