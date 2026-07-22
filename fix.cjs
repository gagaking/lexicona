const fs = require('fs');

console.log('Starting layout upgrade on bone icons and skeletons...');

// 1. Update src/views/Gallery.tsx
try {
  let gallery = fs.readFileSync('src/views/Gallery.tsx', 'utf-8');
  
  // Add Bone to import
  gallery = gallery.replace(
    "ZoomIn, Tag } from 'lucide-react'",
    "ZoomIn, Tag, Bone } from 'lucide-react'"
  );
  gallery = gallery.replace(
    'ZoomIn, Tag } from "lucide-react"',
    'ZoomIn, Tag, Bone } from "lucide-react"'
  );
  
  // Replace top-left skeleton label on card
  const targetLabel = `{asset.poseCoordinates && !isSelected && (
                        <div className="absolute top-3 left-3 z-[15] flex items-center gap-1 bg-[#1E1E1E]/80 backdrop-blur-md text-white/95 px-1.5 py-0.5 text-[10px] font-sans border border-white/5 rounded-sm whitespace-nowrap shadow-sm">
                          🦴 骨骼
                        </div>
                      )}`;
  
  const replLabel = `{asset.poseCoordinates && !isSelected && (
                        <div className="absolute top-3 left-3 z-[15] flex items-center gap-1.5 bg-black/75 backdrop-blur-md text-white/90 px-2 py-0.5 text-[10px] font-sans border border-white/5 shadow-xs">
                          <Bone className="w-3 h-3 text-amber-500 shrink-0" />
                          <span>骨骼</span>
                        </div>
                      )}`;
  
  // Try raw replace, if not found try regex
  if (gallery.includes('🦴 骨骼')) {
    // Split lines to bypass CRLF differences
    let lines = gallery.split(/\r?\n/);
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('🦴 骨骼')) {
        lines[i] = lines[i].replace('🦴 骨骼', '<Bone className="w-3 h-3 text-amber-500 shrink-0" /> <span>骨骼</span>');
        // Let's also adjust line i-1 if it has gap-1 and bg-[#1E1E1E]/80 etc.
        if (i > 0 && lines[i-1].includes('gap-1 bg-[#1E1E1E]/80')) {
          lines[i-1] = lines[i-1].replace(
            'gap-1 bg-[#1E1E1E]/80 backdrop-blur-md text-white/95 px-1.5 py-0.5 text-[10px]',
            'gap-1.5 bg-black/75 backdrop-blur-md text-white/90 px-2 py-0.5 text-[10px]'
          );
        }
        found = true;
      }
    }
    if (found) {
      gallery = lines.join('\n');
    }
  }

  // Replace copy button
  if (gallery.includes('快速生成并复制骨骼图')) {
    let lines = gallery.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('title="快速生成并复制骨骼图"')) {
        // Class is in i-1 or i-2
        for (let j = Math.max(0, i-5); j < i; j++) {
          if (lines[j].includes('className="flex items-center justify-center text-white/95 hover:text-white transition-colors bg-amber-600/60 hover:bg-amber-600/95')) {
            lines[j] = lines[j].replace(
              'className="flex items-center justify-center text-white/95 hover:text-white transition-colors bg-amber-600/60 hover:bg-amber-600/95',
              'className="flex items-center justify-center text-amber-400 hover:text-amber-300 transition-colors bg-black/45 hover:bg-black/80'
            );
          }
        }
        // Content "🦴" is in i+1 or i+2
        for (let j = i+1; j <= i+3; j++) {
          if (lines[j] && lines[j].trim() === '🦴') {
            lines[j] = lines[j].replace('🦴', '<Bone className="w-4 h-4" />');
          }
        }
      }
    }
    gallery = lines.join('\n');
  }

  fs.writeFileSync('src/views/Gallery.tsx', gallery, 'utf-8');
  console.log('Gallery.tsx updated successfully.');
} catch (e) {
  console.error('Error updating Gallery.tsx:', e);
}

// 2. Update src/views/MoodboardView.tsx
try {
  let mb = fs.readFileSync('src/views/MoodboardView.tsx', 'utf-8');
  
  // Add Bone to import
  mb = mb.replace(
    "X, Shirt } from 'lucide-react'",
    "X, Shirt, Bone } from 'lucide-react'"
  );
  mb = mb.replace(
    'X, Shirt } from "lucide-react"',
    'X, Shirt, Bone } from "lucide-react"'
  );
  
  if (mb.includes('已复制骨骼') || mb.includes('复制骨骼图并美化对齐')) {
    let lines = mb.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('已复制骨骼') && lines[i].includes('复制骨骼图并美化对齐')) {
        lines[i] = lines[i].replace(
          '{copiedPoseIndex === index ? "已复制骨骼" : "🦴 复制骨骼图并美化对齐"}',
          `{copiedPoseIndex === index ? (
                                   <>
                                     <Check className="w-3 h-3 text-green-500 shrink-0" />
                                     <span>已复制骨骼</span>
                                   </>
                                 ) : (
                                   <>
                                     <Bone className="w-3 h-3 text-amber-500 shrink-0" />
                                     <span>复制骨骼图并美化对齐</span>
                                   </>
                                 )}`
        );
        // Let's search class in preceding lines
        for (let j = Math.max(0, i-5); j < i; j++) {
          if (lines[j].includes('className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium text-blue-700 bg-blue-50') || lines[j].includes('className="flex items-center gap-a px-1.5')) {
            lines[j] = lines[j].replace(
              'text-blue-700 bg-blue-50 hover:bg-blue-600 hover:text-white border border-blue-200',
              'text-amber-700 bg-amber-50 hover:bg-amber-600 hover:text-white border border-amber-200/60'
            );
            lines[j] = lines[j].replace('text-[9px]', 'text-[10px] px-2 py-1 gap-1.5');
          }
        }
      }
    }
    mb = lines.join('\n');
  }

  fs.writeFileSync('src/views/MoodboardView.tsx', mb, 'utf-8');
  console.log('MoodboardView.tsx updated successfully.');
} catch (e) {
  console.error('Error updating MoodboardView.tsx:', e);
}

// 3. Update src/views/ReversePrompt.tsx
try {
  let rp = fs.readFileSync('src/views/ReversePrompt.tsx', 'utf-8');
  
  // Add Bone to import
  rp = rp.replace(
    "Check, RefreshCw } from 'lucide-react'",
    "Check, RefreshCw, Bone } from 'lucide-react'"
  );
  rp = rp.replace(
    'Check, RefreshCw } from "lucide-react"',
    'Check, RefreshCw, Bone } from "lucide-react"'
  );
  
  if (rp.includes('复制骨骼图并美化对齐')) {
    let lines = rp.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('copiedId === p.id + "_pose"') && lines[i].includes('复制骨骼图并美化对齐')) {
        lines[i] = lines[i].replace(
          `{copiedId === p.id + "_pose" ? <><Check className="w-3.5 h-3.5 text-green-600 hover:text-green-200" /> 已复制骨骼</> : <>复制骨骼图并美化对齐 🦴</>}`,
          `{copiedId === p.id + "_pose" ? (
                                            <><Check className="w-3.5 h-3.5 text-green-600" /> 已复制骨骼</>
                                          ) : (
                                            <><Bone className="w-3.5 h-3.5 text-amber-600" /> 复制骨骼图并美化对齐</>
                                          )}`
        );
        // Search class in preceding lines
        for (let j = Math.max(0, i-5); j < i; j++) {
          if (lines[j].includes('className="flex items-center gap-1 text-[10px] text-blue-700 bg-blue-50/80 hover:bg-blue-600')) {
            lines[j] = lines[j].replace(
              'text-blue-700 bg-blue-50/80 hover:bg-blue-600 hover:text-white px-2 py-1 border border-blue-200',
              'text-amber-800 bg-amber-50/80 hover:bg-amber-600 hover:text-white px-2 py-1 border border-amber-200'
            );
            lines[j] = lines[j].replace('gap-1', 'gap-1.5');
          }
        }
      }
    }
    rp = lines.join('\n');
  }

  fs.writeFileSync('src/views/ReversePrompt.tsx', rp, 'utf-8');
  console.log('ReversePrompt.tsx updated successfully.');
} catch (e) {
  console.error('Error updating ReversePrompt.tsx:', e);
}

// 4. Update src/components/AssetDetailModal.tsx
try {
  let modal = fs.readFileSync('src/components/AssetDetailModal.tsx', 'utf-8');
  
  // Add Bone to import
  modal = modal.replace(
    "Lock, Unlock } from 'lucide-react'",
    "Lock, Unlock, Bone } from 'lucide-react'"
  );
  modal = modal.replace(
    'Lock, Unlock } from "lucide-react"',
    'Lock, Unlock, Bone } from "lucide-react"'
  );
  
  if (modal.includes('复制骨骼图')) {
    let lines = modal.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('🦴 复制骨骼图')) {
        lines[i] = lines[i].replace(
          '🦴 复制骨骼图',
          '<Bone className="w-3.5 h-3.5 text-amber-500" /><span>复制骨骼图</span>'
        );
        // Let's adjust class if in preceding lines
        for (let j = Math.max(0, i-5); j < i; j++) {
          if (lines[j].includes('className="flex items-center text-[11px] text-amber-700 hover:text-amber-800 uppercase tracking-[0.15em]')) {
            lines[j] = lines[j].replace(
              'className="flex items-center text-[11px] text-amber-700 hover:text-amber-800 uppercase tracking-[0.15em]',
              'className="flex items-center gap-1.5 text-[11px] text-amber-700 hover:text-amber-800 uppercase tracking-[0.15em]'
            );
          }
        }
      }
    }
    modal = lines.join('\n');
  }

  fs.writeFileSync('src/components/AssetDetailModal.tsx', modal, 'utf-8');
  console.log('AssetDetailModal.tsx updated successfully.');
} catch (e) {
  console.error('Error updating AssetDetailModal.tsx:', e);
}

console.log('All updates finished.');
