@group(0) @binding(0) var<storage, read> modelViews: array<mat4x4<f32>>;
@group(0) @binding(1) var<uniform> cameraProjection: mat4x4<f32>;
@group(0) @binding(2) var<uniform> lightProjection: mat4x4<f32>;
@group(0) @binding(3) var<storage, read> colors : array<vec4<f32>>;

struct VertexOutput {
  @builtin(position) Position : vec4<f32>,
  @location(0) fragPosition : vec3<f32>,
  @location(1) fragNormal : vec3<f32>,
  @location(2) fragUV : vec2<f32>,
  @location(3) fragColor: vec4<f32>,
  @location(4) shadowPos: vec3<f32>
};

@vertex
fn main(
  @builtin(instance_index) index : u32,
  @location(0) position : vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv : vec2<f32>
) -> VertexOutput {
  let modelView = modelViews[index];
  let pos = vec4<f32>(position, 1.0);
  let mvp = cameraProjection * modelView;

  var output : VertexOutput;

  output.Position = mvp * pos;
  output.fragPosition = (modelView * pos).xyz;
  output.fragNormal =  (modelView * vec4<f32>(normal, 0.0)).xyz;
  //output.fragNormal = (normalMatrix * vec4<f32>(normal, 1.0)).xyz;
  output.fragUV = uv;
  output.fragColor = colors[index];

  let posFromLight : vec4<f32> = lightProjection * modelView * pos;
  output.shadowPos = vec3<f32>(posFromLight.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5), posFromLight.z);
  
  return output;
}