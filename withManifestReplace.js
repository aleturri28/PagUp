const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withManifestReplace(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;
    
    // Assicuriamoci che l'xmlns:tools sia presente
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    // Aggiungiamo tools:replace all'applicazione
    if (manifest.application && manifest.application[0]) {
      const application = manifest.application[0];
      
      const currentReplace = application.$['tools:replace'] || '';
      
      if (!currentReplace.includes('android:appComponentFactory')) {
        application.$['tools:replace'] = currentReplace 
          ? currentReplace + ',android:appComponentFactory'
          : 'android:appComponentFactory';
      }
      
      // Bisogna anche specificare il nuovo valore se usiamo tools:replace
      application.$['android:appComponentFactory'] = 'androidx.core.app.CoreComponentFactory';
    }

    return config;
  });
};
