/** A 5x5 pixel font for signs, banners and number plates. */
const GLYPHS: Record<string, string> = {
  '0': '.###.#..###.#.###..#.###.',
  '1': '..#...##....#....#...###.',
  '2': '####.....#.###.#....#####',
  '3': '####.....#.###.....#####.',
  '4': '#..#.#..#.#####...#....#.',
  '5': '######....####.....#####.',
  '6': '.###.#....####.#...#.###.',
  '7': '#####...#...#...#....#...',
  '8': '.###.#...#.###.#...#.###.',
  '9': '.###.#...#.####....#.###.',
  A: '.###.#...#######...##...#',
  B: '####.#...#####.#...#####.',
  C: '.#####....#....#.....####',
  D: '####.#...##...##...#####.',
  E: '######....####.#....#####',
  F: '######....####.#....#....',
  G: '.#####....#..###...#.###.',
  H: '#...##...#######...##...#',
  I: '#####..#....#....#..#####',
  K: '#...##..#.###..#..#.#...#',
  L: '#....#....#....#....#####',
  M: '#...###.###.#.##...##...#',
  N: '#...###..##.#.##..###...#',
  O: '.###.#...##...##...#.###.',
  P: '####.#...#####.#....#....',
  R: '####.#...#####.#..#.#...#',
  S: '.#####.....###.....#####.',
  T: '#####..#....#....#....#..',
  U: '#...##...##...##...#.###.',
  V: '#...##...##...#.#.#...#..',
  W: '#...##...##.#.###.###...#',
  Y: '#...#.#.#...#....#....#..',
  '!': '..#....#....#.........#..',
  '?': '.###.#...#..##........#..',
  ' ': '.........................',
};

export const GLYPH = 5;

/** Calls plot for every lit pixel of the text, `scale` pixels per font pixel, one blank column between letters. */
export function drawText(text: string, x: number, y: number, scale: number, plot: (x: number, y: number) => void): void {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    for (let i = 0; i < 25; i++) {
      if (g[i] !== '#') continue;
      const gx = i % 5;
      const gy = Math.floor(i / 5);
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) plot(cx + gx * scale + sx, y + gy * scale + sy);
    }
    cx += (GLYPH + 1) * scale;
  }
}

export function textWidth(text: string, scale: number): number {
  return text.length * (GLYPH + 1) * scale - scale;
}
