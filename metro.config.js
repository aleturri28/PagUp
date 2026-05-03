const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Disable the problematic importExportLiveBindings transform
config.transformer = {
  ...config.transformer,
  unstable_disableImportExportLiveBindings: true,
};

module.exports = config;
