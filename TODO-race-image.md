# TODO: AI Race Mode Image Support

## Known Issue
When autoRace is enabled and an image is attached, the race mode fails with
"nvidia API error Connection failed" because non-vision-capable providers
are selected or the vision fallback logic doesn't work correctly.

## Workaround
Use Google Gemini model directly and turn off auto-select (autoRace).

## Tasks
- [ ] Debug why race diversification still fails with images (vision model filtering + diversification interaction)
- [ ] Verify NVIDIA vision model (nemotron-ultra) actually accepts image input format
- [ ] Test race mode with multiple vision-capable providers configured
- [ ] Ensure single-mode vision fallback correctly switches provider when image attached
- [ ] Remove debug field from single-mode response once fixed
- [ ] Add integration test for image + race mode path
