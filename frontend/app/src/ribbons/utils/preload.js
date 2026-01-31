// preload.js
import assets from "../asset-list";
import Assets from "../Assets";

const loadImage = (url) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
};

const loadAssets = () =>
  new Promise(async (resolve, reject) => {
    console.log("Load Assets", assets);
    if (assets.length > 0) {
      try {
        const loadedAssets = [];
        for (const asset of assets) {
          const img = await loadImage(asset.url);
          loadedAssets.push({
            id: asset.id,
            file: img,
            type: asset.type
          });
        }
        Assets.init(loadedAssets);
        resolve();
      } catch (error) {
        console.error("Error loading assets:", error);
        reject(error);
      }
    } else {
      resolve();
    }
  });

export default loadAssets;
