package io.quotedr.app;

import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        installNativePrintBridge();
        enableImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enableImmersiveMode();
    }

    private void enableImmersiveMode() {
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
            return;
        }

        window.getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    private void installNativePrintBridge() {
        if (this.bridge == null || this.bridge.getWebView() == null) return;
        WebView webView = this.bridge.getWebView();
        webView.addJavascriptInterface(new QuoteDrAndroidBridge(this, webView), "QuoteDrAndroid");
        webView.setWebViewClient(new BridgeWebViewClient(this.bridge) {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectNativePrintPatch(view);
            }
        });
        injectNativePrintPatch(webView);
    }

    private void injectNativePrintPatch(WebView webView) {
        String script = "(function(){"
            + "if(!window.QuoteDrAndroid || window.__quoteDrNativePrintPatched) return;"
            + "window.__quoteDrNativePrintPatched = true;"
            + "window.print = function(){ window.QuoteDrAndroid.printCurrentPage(); };"
            + "})();";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private static class QuoteDrAndroidBridge {
        private final MainActivity activity;
        private final WebView webView;

        QuoteDrAndroidBridge(MainActivity activity, WebView webView) {
            this.activity = activity;
            this.webView = webView;
        }

        @JavascriptInterface
        public void printCurrentPage() {
            activity.runOnUiThread(() -> {
                if (!isAllowedQuoteDrPage()) {
                    Toast.makeText(activity, "Printing is only available inside QuoteDr.", Toast.LENGTH_SHORT).show();
                    return;
                }

                PrintManager printManager = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                if (printManager == null) {
                    Toast.makeText(activity, "Android printing is not available on this device.", Toast.LENGTH_SHORT).show();
                    return;
                }

                String jobName = "QuoteDr Invoice";
                PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(jobName);
                PrintAttributes attributes = new PrintAttributes.Builder()
                    .setMediaSize(PrintAttributes.MediaSize.NA_LETTER)
                    .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                    .build();
                printManager.print(jobName, adapter, attributes);
            });
        }

        private boolean isAllowedQuoteDrPage() {
            String url = webView.getUrl();
            if (url == null) return false;
            Uri uri = Uri.parse(url);
            String host = uri.getHost();
            return "quotedr.io".equals(host) || "127.0.0.1".equals(host) || "localhost".equals(host);
        }
    }
}
