package org.adka.maada;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/** Shares a saved receipt directly to WhatsApp (or WhatsApp Business) when installed. */
@CapacitorPlugin(name = "WhatsAppShare")
public class WhatsAppSharePlugin extends Plugin {

    private static final String[] PACKAGES = { "com.whatsapp", "com.whatsapp.w4b" };

    private String installedPackage() {
        PackageManager pm = getContext().getPackageManager();
        for (String pkg : PACKAGES) {
            try {
                pm.getPackageInfo(pkg, 0);
                return pkg;
            } catch (PackageManager.NameNotFoundException ignored) {
                // try the next one
            }
        }
        return null;
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", installedPackage() != null);
        call.resolve(ret);
    }

    @PluginMethod
    public void share(PluginCall call) {
        String url = call.getString("url");
        String text = call.getString("text", "");
        String pkg = installedPackage();
        if (url == null || pkg == null) {
            call.reject("WhatsApp is not available");
            return;
        }
        try {
            File file = new File(Uri.parse(url).getPath());
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType(url.endsWith(".pdf") ? "application/pdf" : "image/png");
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            if (text != null && !text.isEmpty()) intent.putExtra(Intent.EXTRA_TEXT, text);
            intent.setPackage(pkg);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("WhatsApp is not available");
        } catch (Exception e) {
            call.reject("Could not share to WhatsApp: " + e.getMessage());
        }
    }
}
