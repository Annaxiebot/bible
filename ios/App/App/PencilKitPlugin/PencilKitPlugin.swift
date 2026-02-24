import Capacitor
import PencilKit
import UIKit

@objc(PencilKitPlugin)
public class PencilKitPlugin: CAPPlugin {
    private var canvasViewController: PKCanvasViewController?
    
    @objc func openCanvas(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // Get existing drawing data if provided
            let drawingData = call.getString("drawingData")
            
            // Create and present canvas view controller
            let canvasVC = PKCanvasViewController()
            
            if let data = drawingData, let drawingDataDecoded = Data(base64Encoded: data) {
                if let drawing = try? PKDrawing(data: drawingDataDecoded) {
                    canvasVC.drawing = drawing
                }
            }
            
            canvasVC.onSave = { drawing in
                // Convert PKDrawing to base64
                let data = drawing.dataRepresentation()
                let base64 = data.base64EncodedString()
                call.resolve(["drawingData": base64])
            }
            
            canvasVC.onCancel = {
                call.resolve(["cancelled": true])
            }
            
            self.bridge?.viewController?.present(canvasVC, animated: true)
            self.canvasViewController = canvasVC
        }
    }
}

// Custom PKCanvasView wrapper
class PKCanvasViewController: UIViewController {
    var drawing: PKDrawing = PKDrawing()
    var onSave: ((PKDrawing) -> Void)?
    var onCancel: (() -> Void)?
    
    private lazy var canvasView: PKCanvasView = {
        let canvas = PKCanvasView(frame: view.bounds)
        canvas.drawing = drawing
        canvas.tool = PKInkingTool(.pen, color: .black, width: 2)
        canvas.drawingPolicy = .anyInput  // Pencil or finger
        canvas.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        return canvas
    }()
    
    private lazy var toolPicker: PKToolPicker = {
        let picker = PKToolPicker()
        return picker
    }()
    
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        view.addSubview(canvasView)
        
        // Add toolbar with Done/Cancel
        setupToolbar()
        
        // Show tool picker
        toolPicker.setVisible(true, forFirstResponder: canvasView)
        toolPicker.addObserver(canvasView)
        canvasView.becomeFirstResponder()
    }
    
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        canvasView.frame = view.bounds
    }
    
    private func setupToolbar() {
        let toolbar = UIToolbar()
        toolbar.translatesAutoresizingMaskIntoConstraints = false
        
        let cancelButton = UIBarButtonItem(title: "Cancel", style: .plain, target: self, action: #selector(handleCancel))
        let flexSpace = UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)
        let doneButton = UIBarButtonItem(title: "Done", style: .done, target: self, action: #selector(handleDone))
        
        toolbar.items = [cancelButton, flexSpace, doneButton]
        view.addSubview(toolbar)
        
        NSLayoutConstraint.activate([
            toolbar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            toolbar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            toolbar.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
    }
    
    @objc private func handleDone() {
        onSave?(canvasView.drawing)
        dismiss(animated: true)
    }
    
    @objc private func handleCancel() {
        onCancel?()
        dismiss(animated: true)
    }
}
