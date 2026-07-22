const CATEGORIES = [
  { key: 'styleEffect' },
  { key: 'lightingAngle' },
  { key: 'subjectPose' },
];
const pool = [
  { id: '1', styleEffect: 'a1', lightingAngle: 'b1', subjectPose: 'c1' },
  { id: '2', styleEffect: 'a2', lightingAngle: 'b2', subjectPose: 'c2' },
  { id: '3', styleEffect: 'a3', lightingAngle: 'b3', subjectPose: 'c3' },
  { id: '4', styleEffect: 'a4', lightingAngle: 'b4', subjectPose: 'c4' },
  { id: '5', styleEffect: 'a5', lightingAngle: 'b5', subjectPose: 'c5' },
  { id: '6', styleEffect: 'a6', lightingAngle: 'b6', subjectPose: 'c6' },
  { id: '7', styleEffect: 'a7', lightingAngle: 'b7', subjectPose: 'c7' },
  { id: '8', styleEffect: 'a8', lightingAngle: 'b8', subjectPose: 'c8' },
];

const results = [];
for (let i = 0; i < 50; i++) {
  const comb = {};
  CATEGORIES.forEach(c => {
    const k = c.key;
    const validAssets = pool.filter(a => !!a[k]);
    if (validAssets.length > 0) {
      const idx = Math.floor(Math.random() * validAssets.length);
      comb[k] = validAssets[idx][k];
    }
  });
  results.push(comb);
}

const counts = {};
results.forEach(r => {
  const str = JSON.stringify(r);
  counts[str] = (counts[str] || 0) + 1;
});
console.log("Unique combinations:", Object.keys(counts).length);
