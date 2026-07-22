import Papa from 'papaparse';
import { v4 as uuidv4 } from 'uuid';
import { Asset } from '../types';

export const parseCSV = (file: File): Promise<Asset[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const seenIds = new Set<string>();
          const assets: Asset[] = results.data.map((row: any, index: number) => {
            let providedId = row.id || row.ID || row['①id'];
            let title = row.title || row.Title || row['②title'] || 'Untitled';
            let imageUrl = row.image_url || row['图片URL'] || row['⑫图片URL'] || row.url || row.URL || '';
            
            let id = providedId;
            if (!id) {
               const fallbackStr = title + '_' + imageUrl;
               if (title || imageUrl) {
                   id = btoa(encodeURIComponent(fallbackStr)).replace(/[=+\/]/g, '').substring(0, 32);
               } else {
                   id = uuidv4();
               }
            }

            if (seenIds.has(id)) {
              id = `${id}-${index}`;
            }
            seenIds.add(id);
            return {
              id,
              title,
              styleEffect: row.style_effect || row['风格与效果'] || row['③风格与效果'] || '',
              lightingAngle: row.lighting_angle || row['光影与机位'] || row['④光影与机位'] || '',
              subjectPose: row.subject_pose || row['主体与姿态'] || row['⑤主体与姿态'] || '',
              colorVibe: row.color_vibe || row['主色与氛围'] || row['⑥主色与氛围'] || '',
              backgroundSpace: row.background_space || row['背景与空间'] || row['⑦背景与空间'] || '',
              propsInteraction: row.props_interaction || row['道具与互动'] || row['⑧道具与互动'] || '',
              actionDetails: row.action_details || row['动作与细节'] || row['⑨动作与细节'] || '',
              outfitStyle: row.outfit_style || row['穿搭与风格'] || row['⑩穿搭与风格'] || '',
              specialEffects: row.special_effects || row['特殊效果'] || row['⑪特殊效果'] || '',
              imageUrl: row.image_url || row['图片URL'] || row['⑫图片URL'] || row.url || row.URL || '',
              tags: row.tags || row['标签'] || row['⑬标签'] || '',
              createdAt: Date.now(),
            };
          });
          resolve(assets);
        } catch (e) {
          reject(e);
        }
      },
      error: (error) => reject(error),
    });
  });
};

export const parseCSVFromUrl = async (urls: string[] | string): Promise<Asset[]> => {
  const urlList = Array.isArray(urls) ? urls : [urls];
  let csvText = "";
  for (const url of urlList) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        csvText = await res.text();
        break;
      }
    } catch (e) {}
  }

  if (!csvText) {
    throw new Error("全部CDN挂了");
  }

  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const seenIds = new Set<string>();
          const assets: Asset[] = results.data.map((row: any, index: number) => {
            let providedId = row.id || row.ID || row['①id'];
            let title = row.title || row.Title || row['②title'] || 'Untitled';
            let imageUrl = row.image_url || row['图片URL'] || row['⑫图片URL'] || row.url || row.URL || '';
            
            let id = providedId;
            if (!id) {
               const fallbackStr = title + '_' + imageUrl;
               if (title || imageUrl) {
                   id = btoa(encodeURIComponent(fallbackStr)).replace(/[=+\/]/g, '').substring(0, 32);
               } else {
                   id = uuidv4();
               }
            }

            if (seenIds.has(id)) {
              id = `${id}-${index}`;
            }
            seenIds.add(id);
            return {
              id,
              title,
              styleEffect: row.style_effect || row['风格与效果'] || row['③风格与效果'] || '',
              lightingAngle: row.lighting_angle || row['光影与机位'] || row['④光影与机位'] || '',
              subjectPose: row.subject_pose || row['主体与姿态'] || row['⑤主体与姿态'] || '',
              colorVibe: row.color_vibe || row['主色与氛围'] || row['⑥主色与氛围'] || '',
              backgroundSpace: row.background_space || row['背景与空间'] || row['⑦背景与空间'] || '',
              propsInteraction: row.props_interaction || row['道具与互动'] || row['⑧道具与互动'] || '',
              actionDetails: row.action_details || row['动作与细节'] || row['⑨动作与细节'] || '',
              outfitStyle: row.outfit_style || row['穿搭与风格'] || row['⑩穿搭与风格'] || '',
              specialEffects: row.special_effects || row['特殊效果'] || row['⑪特殊效果'] || '',
              imageUrl: row.image_url || row['图片URL'] || row['⑫图片URL'] || row.url || row.URL || '',
              tags: row.tags || row['标签'] || row['⑬标签'] || '',
              createdAt: Date.now(),
            };
          });
          resolve(assets);
        } catch (e) {
          reject(e);
        }
      },
      error: (error) => reject(error),
    });
  });
};

export const exportCSV = (assets: Asset[]) => {
  const data = assets.map((a) => ({
    'id': a.id,
    'title': a.title,
    '风格与效果': a.styleEffect,
    '光影与机位': a.lightingAngle,
    '主体与姿态': a.subjectPose,
    '主色与氛围': a.colorVibe,
    '背景与空间': a.backgroundSpace,
    '道具与互动': a.propsInteraction,
    '动作与细节': a.actionDetails,
    '穿搭与风格': a.outfitStyle,
    '特殊效果': a.specialEffects,
    '提示词(中)': [a.styleEffect, a.lightingAngle, a.subjectPose, a.colorVibe, a.backgroundSpace, a.propsInteraction, a.actionDetails, a.outfitStyle, a.specialEffects].filter(Boolean).join(', '),
    '图片URL': a.imageUrl,
    '标签': a.tags,
  }));
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'assets_export.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
