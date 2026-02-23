#import <Capacitor/Capacitor.h>

CAP_PLUGIN(PencilKitPlugin, "PencilKitPlugin",
    CAP_PLUGIN_METHOD(show, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(hide, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(clear, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(undo, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setTool, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(loadDrawing, CAPPluginReturnPromise);
)
