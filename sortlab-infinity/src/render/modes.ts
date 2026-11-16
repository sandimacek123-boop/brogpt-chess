export type VisualMode =
  | 'bars'
  | 'horizontal'
  | 'ring'
  | 'spiral'
  | 'scatter'
  | 'rainbowCircle'
  | 'sunburst'
  | 'triangle'
  | 'waveform'
  | 'dots'
  | 'pixelGrid'
  | 'colorWheel'
  | 'helix'
  | 'stripes'
  | 'blocks'
  | 'disparity'
  | 'bars3d'
  | 'sphere3d'
  | 'radialLines'
  | 'migraine';

export const VISUAL_MODES: { id: VisualMode; name: string; description: string; is3d?: boolean }[] = [
  { id: 'bars', name: 'Vertical bars', description: 'Classic bars on a shared baseline; sorted data forms a right-angled triangle.' },
  { id: 'horizontal', name: 'Horizontal bars', description: 'Bars grow from the left edge, one row per element.' },
  { id: 'ring', name: 'Circular ring', description: 'Bars radiate outward from an inner ring.' },
  { id: 'spiral', name: 'Spiral', description: 'Angle = position, radius = value. Sorted data traces an Archimedean spiral.' },
  { id: 'scatter', name: 'Scatter plot', description: 'Position vs. value with axes; sorted data falls on the diagonal.' },
  { id: 'rainbowCircle', name: 'Rainbow circle', description: 'A ring of colour segments; sorted data is a smooth hue circle.' },
  { id: 'sunburst', name: 'Sunburst', description: 'Polar area wedges whose radius is the value.' },
  { id: 'triangle', name: 'Triangle', description: 'Centred rows; sorted data forms an isosceles pyramid.' },
  { id: 'waveform', name: 'Waveform', description: 'Mirrored amplitude envelope like an audio waveform.' },
  { id: 'dots', name: 'Dots', description: 'A glowing dot at the top of each would-be bar.' },
  { id: 'pixelGrid', name: 'Pixel grid', description: 'Elements laid out row by row as coloured pixels.' },
  { id: 'colorWheel', name: 'Color wheel', description: 'Filled pie wedges coloured by value with a white core.' },
  { id: 'helix', name: 'Helix', description: 'A double helix whose amplitude follows the values.' },
  { id: 'stripes', name: 'Rainbow stripes', description: 'Full-height stripes: only colour encodes the value.' },
  { id: 'blocks', name: 'Gradient blocks', description: 'Bars split into shaded LED-style blocks.' },
  { id: 'disparity', name: 'Disparity', description: 'Distance from each element’s final position; sorted data is a perfect circle.' },
  { id: 'bars3d', name: '3D bars', description: 'WebGL bars in a slowly orbiting 3D scene.', is3d: true },
  { id: 'sphere3d', name: '3D sphere', description: 'Elements on a Fibonacci sphere, pushed outward by value.', is3d: true },
  { id: 'radialLines', name: 'Radial lines', description: 'Thin additive rays from the centre, length = value.' },
  { id: 'migraine', name: 'Migraine', description: 'Kaleidoscopic chaos driven by disorder. Non-flashing; intensity adjustable.' },
];
