import Capacitor
import PencilKit
import UIKit

/// Native PencilKit plugin for Capacitor.
/// Provides a native Apple Pencil drawing surface overlaid on the WKWebView,
/// bypassing the web canvas limitations on iOS (strokes disappearing at speed).
@objc(PencilKitPlugin)
public class PencilKitPlugin: CAPPlugin, PKCanvasViewDelegate {

    // MARK: - Properties

    private var canvasView: PKCanvasView?
    private var containerView: UIView?
    private var toolPicker: PKToolPicker?

    // MARK: - Plugin Methods

    /// Show the PencilKit canvas overlaid on the web view.
    /// Accepts: { x: number, y: number, width: number, height: number, savedData?: string }
    @objc func show(_ call: CAPPluginCall) {
        let x = call.getFloat("x") ?? 0
        let y = call.getFloat("y") ?? 0
        let width = call.getFloat("width") ?? Float(UIScreen.main.bounds.width)
        let height = call.getFloat("height") ?? 400

        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.reject("Plugin deallocated")
                return
            }

            // Remove existing canvas if any
            self.removeCanvasView()

            guard let webView = self.bridge?.webView else {
                call.reject("WebView not available")
                return
            }

            // Create container view for clipping
            let frame = CGRect(
                x: CGFloat(x),
                y: CGFloat(y),
                width: CGFloat(width),
                height: CGFloat(height)
            )

            let container = UIView(frame: frame)
            container.backgroundColor = .clear
            container.clipsToBounds = true
            container.isUserInteractionEnabled = true

            // Create PKCanvasView
            let canvas = PKCanvasView(frame: container.bounds)
            canvas.backgroundColor = .clear
            canvas.isOpaque = false
            canvas.drawingPolicy = .pencilOnly
            canvas.delegate = self
            canvas.autoresizingMask = [.flexibleWidth, .flexibleHeight]

            // Default tool: black pen, size 2
            canvas.tool = PKInkingTool(.pen, color: .black, width: 2)

            // Allow finger drawing to be toggled; default to pencil-only for palm rejection
            canvas.allowsFingerDrawing = false

            // Load saved drawing data if provided
            if let savedData = call.getString("savedData"),
               let data = Data(base64Encoded: savedData) {
                do {
                    let drawing = try PKDrawing(data: data)
                    canvas.drawing = drawing
                } catch {
                    // Failed to load drawing, start fresh
                    print("PencilKitPlugin: Failed to load saved drawing: \(error)")
                }
            }

            container.addSubview(canvas)
            webView.superview?.addSubview(container)

            // Bring container above the web view
            if let superview = webView.superview {
                superview.bringSubviewToFront(container)
            }

            self.canvasView = canvas
            self.containerView = container

            call.resolve()
        }
    }

    /// Hide the PencilKit canvas and return the drawing data as base64.
    /// Returns: { data: string } where data is base64-encoded PKDrawing
    @objc func hide(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.reject("Plugin deallocated")
                return
            }

            var resultData = ""

            if let canvas = self.canvasView {
                let drawing = canvas.drawing
                let data = drawing.dataRepresentation()
                resultData = data.base64EncodedString()
            }

            self.removeCanvasView()

            call.resolve(["data": resultData])
        }
    }

    /// Clear the current drawing.
    @objc func clear(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.reject("Plugin deallocated")
                return
            }

            self.canvasView?.drawing = PKDrawing()
            call.resolve()
        }
    }

    /// Undo the last stroke.
    @objc func undo(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.reject("Plugin deallocated")
                return
            }

            self.canvasView?.undoManager?.undo()
            call.resolve()
        }
    }

    /// Set the current drawing tool.
    /// Accepts: { tool: 'pen'|'marker'|'highlighter'|'eraser', color: '#hex', size: number }
    @objc func setTool(_ call: CAPPluginCall) {
        let toolName = call.getString("tool") ?? "pen"
        let colorHex = call.getString("color") ?? "#000000"
        let size = call.getDouble("size") ?? 2.0

        DispatchQueue.main.async { [weak self] in
            guard let self = self, let canvas = self.canvasView else {
                call.reject("Canvas not available")
                return
            }

            let color = UIColor(hex: colorHex) ?? .black

            switch toolName {
            case "pen":
                canvas.tool = PKInkingTool(.pen, color: color, width: CGFloat(size))

            case "marker":
                canvas.tool = PKInkingTool(.marker, color: color, width: CGFloat(size * 2.5))

            case "highlighter":
                // Use marker ink type with reduced alpha for highlighter effect
                let highlightColor = color.withAlphaComponent(0.3)
                canvas.tool = PKInkingTool(.marker, color: highlightColor, width: CGFloat(size * 5))

            case "eraser":
                canvas.tool = PKEraserTool(.bitmap)

            default:
                canvas.tool = PKInkingTool(.pen, color: color, width: CGFloat(size))
            }

            call.resolve()
        }
    }

    /// Load a previously saved drawing from base64 data.
    /// Accepts: { data: string } where data is base64-encoded PKDrawing
    @objc func loadDrawing(_ call: CAPPluginCall) {
        guard let base64String = call.getString("data"),
              let data = Data(base64Encoded: base64String) else {
            call.reject("Invalid or missing drawing data")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self, let canvas = self.canvasView else {
                call.reject("Canvas not available")
                return
            }

            do {
                let drawing = try PKDrawing(data: data)
                canvas.drawing = drawing
                call.resolve()
            } catch {
                call.reject("Failed to load drawing: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - PKCanvasViewDelegate

    public func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        let data = canvasView.drawing.dataRepresentation()
        let base64 = data.base64EncodedString()

        notifyListeners("drawingChanged", data: [
            "drawing": base64
        ])
    }

    // MARK: - Private Helpers

    private func removeCanvasView() {
        canvasView?.delegate = nil
        canvasView?.removeFromSuperview()
        canvasView = nil
        containerView?.removeFromSuperview()
        containerView = nil
    }
}

// MARK: - UIColor Hex Extension

extension UIColor {
    convenience init?(hex: String) {
        var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")

        var rgb: UInt64 = 0
        guard Scanner(string: hexSanitized).scanHexInt64(&rgb) else { return nil }

        let length = hexSanitized.count
        let r, g, b, a: CGFloat

        switch length {
        case 6: // RGB
            r = CGFloat((rgb & 0xFF0000) >> 16) / 255.0
            g = CGFloat((rgb & 0x00FF00) >> 8) / 255.0
            b = CGFloat(rgb & 0x0000FF) / 255.0
            a = 1.0
        case 8: // RGBA
            r = CGFloat((rgb & 0xFF000000) >> 24) / 255.0
            g = CGFloat((rgb & 0x00FF0000) >> 16) / 255.0
            b = CGFloat((rgb & 0x0000FF00) >> 8) / 255.0
            a = CGFloat(rgb & 0x000000FF) / 255.0
        default:
            return nil
        }

        self.init(red: r, green: g, blue: b, alpha: a)
    }
}
