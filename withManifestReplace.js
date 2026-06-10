const {
  withAndroidManifest,
  withAndroidStyles,
  withMainActivity,
} = require('@expo/config-plugins');

const SYSTEM_BAR_IMPORTS = [
  'import android.graphics.Color',
  'import android.view.View',
  'import android.view.WindowManager',
  'import androidx.core.view.ViewCompat',
  'import androidx.core.view.WindowCompat',
  'import androidx.core.view.WindowInsetsCompat',
];

const SYSTEM_BAR_LIFECYCLE_BLOCK = `
  override fun onResume() {
    super.onResume()
    showSystemBars()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)

    if (hasFocus) {
      showSystemBars()
    }
  }
`;

const SYSTEM_BAR_METHODS = `
  private fun installSystemBarGuard() {
    showSystemBars()

    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
      val systemBars = WindowInsetsCompat.Type.systemBars()

      if (!insets.isVisible(systemBars)) {
        view.post { showSystemBars() }
      }

      insets
    }
  }

  @Suppress("DEPRECATION")
  private fun showSystemBars() {
    val decorView = window.decorView

    window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
    window.clearFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS)
    WindowCompat.setDecorFitsSystemWindows(window, true)

    var systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      systemUiVisibility = systemUiVisibility or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      systemUiVisibility = systemUiVisibility or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
    }

    decorView.systemUiVisibility = systemUiVisibility
    window.statusBarColor = Color.WHITE
    window.navigationBarColor = Color.WHITE

    WindowCompat.getInsetsController(window, decorView).apply {
      show(WindowInsetsCompat.Type.systemBars())
      isAppearanceLightStatusBars = true
      isAppearanceLightNavigationBars = true
    }
  }
`;

module.exports = function withManifestReplace(config) {
  config = withAndroidManifest(config, async (config) => {
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

  config = withAndroidStyles(config, (config) => {
    const appTheme = findStyle(config.modResults, 'AppTheme');

    if (appTheme) {
      upsertStyleItem(appTheme, 'android:navigationBarColor', '#ffffff');
      upsertStyleItem(appTheme, 'android:statusBarColor', '#ffffff');
      upsertStyleItem(appTheme, 'android:windowDrawsSystemBarBackgrounds', 'true');
      upsertStyleItem(appTheme, 'android:windowFullscreen', 'false');
      upsertStyleItem(appTheme, 'android:windowLightNavigationBar', 'true', {
        'tools:targetApi': '27',
      });
      upsertStyleItem(appTheme, 'android:windowLightStatusBar', 'true', {
        'tools:targetApi': '23',
      });
    }

    return config;
  });

  config = withMainActivity(config, (config) => {
    if (config.modResults.language === 'kt') {
      config.modResults.contents = withAndroidSystemBarGuard(config.modResults.contents);
    }

    return config;
  });

  return config;
};

function findStyle(resources, name) {
  return resources.resources?.style?.find((style) => style.$?.name === name);
}

function upsertStyleItem(style, name, value, attrs = {}) {
  style.item = style.item || [];

  const item = style.item.find((item) => item.$?.name === name);

  if (item) {
    item._ = value;
    item.$ = { ...item.$, ...attrs, name };
    return;
  }

  style.item.push({
    _: value,
    $: { name, ...attrs },
  });
}

function withAndroidSystemBarGuard(contents) {
  let next = contents;

  for (const importLine of SYSTEM_BAR_IMPORTS) {
    next = ensureKotlinImport(next, importLine);
  }

  if (!next.includes('installSystemBarGuard()')) {
    next = next.replace(
      /(super\.onCreate\((?:null|savedInstanceState)\)\n)/,
      '$1    installSystemBarGuard()\n'
    );
  }

  if (!next.includes('override fun onResume()')) {
    next = next.replace(
      /\n  \/\*\*\n   \* Returns the name/,
      `${SYSTEM_BAR_LIFECYCLE_BLOCK}\n  /**\n   * Returns the name`
    );
  }

  if (!next.includes('private fun showSystemBars()')) {
    const lastClassBrace = next.lastIndexOf('\n}');

    if (lastClassBrace !== -1) {
      next = `${next.slice(0, lastClassBrace)}\n${SYSTEM_BAR_METHODS}${next.slice(lastClassBrace)}`;
    }
  }

  return next;
}

function ensureKotlinImport(contents, importLine) {
  if (contents.includes(importLine)) {
    return contents;
  }

  const imports = [...contents.matchAll(/^import .+$/gm)];

  if (imports.length === 0) {
    return contents.replace(/^(package .+\n)/m, `$1\n${importLine}\n`);
  }

  const lastImport = imports[imports.length - 1];
  const insertAt = lastImport.index + lastImport[0].length;

  return `${contents.slice(0, insertAt)}\n${importLine}${contents.slice(insertAt)}`;
}
