# Apple Pencil Improvements - Applepencil Branch

## Problem
The Bible app's Apple Pencil annotation feature was losing strokes during handwriting, making it nearly unusable on iPad. Users would draw but strokes would disappear or be incomplete.

## Root Cause
The original implementation lacked proper **palm rejection** techniques. When users wrote with Apple Pencil, their palm or side of their hand would register as additional touches, causing the drawing system to stop mid-stroke.

## Solution
Implemented advanced palm rejection techniques based on the proven solution from the math repo:

### 1. Multi-Touch Rejection
- **Immediate rejection**: If more than one touch is detected at any time, reject the input
- **Mid-stroke protection**: If multi-touch is detected during drawing, immediately stop the current stroke
- This prevents palm/hand touches from interfering with Apple Pencil input

### 2. Touch Radius-Based Palm Rejection
- **Apple Pencil**: Typically has `radiusX/radiusY < 5 pixels`
- **Finger touches**: Usually `10-20 pixels`  
- **Palm/hand**: Often `30+ pixels`
- **Threshold**: Set at `25 pixels` to reliably distinguish between stylus and palm
- **Dual-axis checking**: Monitors both `radiusX` and `radiusY` for comprehensive detection

### 3. Enhanced Event Handling
- **Aggressive preventDefault()**: Stops iOS from interpreting touches as gestures
- **Continuous monitoring**: Palm rejection works both at stroke start and during drawing
- **Graceful degradation**: Still works on devices that don't support `radiusX/Y`

## Code Changes

### 1. Constants (appConfig.ts)
```typescript
/** Palm rejection: Maximum touch radius threshold (Apple Pencil ~<5, finger ~10-20, palm ~30+) */
PALM_REJECTION_RADIUS: 25,
```

### 2. Enhanced Touch Handlers (DrawingCanvas.tsx)
```typescript
// PALM REJECTION: Immediately reject multi-touch (palm/hand rejection)
if (e.touches.length > 1) {
  if (isDrawingRef.current) {
    isDrawingRef.current = false;
    cancelAnimationFrame(rafIdRef.current);
    currentPointsRef.current = [];
  }
  return;
}

// PALM REJECTION: Reject large touch areas (palm/side of hand)  
if (touch.radiusX && touch.radiusX > DRAWING.PALM_REJECTION_RADIUS) {
  return; // Large touch = palm or side of hand
}
if (touch.radiusY && touch.radiusY > DRAWING.PALM_REJECTION_RADIUS) {
  return; // Large touch in Y dimension too
}
```

### 3. Mid-Stroke Protection
Enhanced `handleTouchMove` to continuously monitor for palm interference during drawing and gracefully stop strokes when detected.

## Technical Details

### Palm Rejection Thresholds
- **Apple Pencil**: `radiusX/Y < 5px` (precise, small contact area)
- **Finger**: `radiusX/Y ~10-20px` (larger but still controlled)
- **Palm/Side of hand**: `radiusX/Y >30px` (large, unintentional contact)
- **Safety threshold**: Set at `25px` to ensure reliable detection

### Browser Compatibility
- **iOS Safari**: Full support for `Touch.radiusX/Y` and multi-touch detection
- **Desktop**: Falls back to pointer events, no palm rejection needed
- **Older devices**: Graceful degradation if radius properties unavailable

## Testing
- ✅ Apple Pencil strokes now complete reliably
- ✅ Palm resting on screen doesn't interfere with drawing
- ✅ Side-of-hand touches are properly rejected
- ✅ Normal finger touches still work for navigation
- ✅ Two-finger scrolling still functions

## References
- Palm rejection techniques adapted from the math repo implementation
- Apple's Touch Events documentation for `radiusX/Y` properties  
- iOS Safari touch handling best practices

## Future Improvements
- Could add pressure-based palm rejection (very light touches might be accidental)
- Could implement adaptive thresholds based on device type
- Could add user preference for palm rejection sensitivity