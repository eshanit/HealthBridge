# AI Response Indicator System - UX Guidelines

## Overview

This document outlines the design patterns and implementation guidelines for displaying AI-generated vs. system-generated content in the HealthBridge nurse mobile application.

---

## Visual Design System

### Color Scheme

| Source Type | Primary Color | Background | Border | Text |
|-------------|---------------|------------|--------|------|
| **AI-Generated** | Purple-400 (`text-purple-400`) | Purple-900/20 | Purple-700/30 | Purple-300 |
| **System-Generated** | Gray-400 (`text-gray-400`) | Gray-700/30 | Gray-600/30 | Gray-400 |

### Icons

- **AI**: Sparkle/magic icon (`M9.663 17h4.673...`) - conveys intelligence/assistance
- **System**: Grid/server icon (`M19 11H5m14 0a2 2 0 012 2v6...`) - conveys structure/rules

### Badge Labels

- **AI-Powered** - Positive framing, emphasizes enhancement
- **System** - Neutral framing, emphasizes reliability

---

## Component Usage

### AIStatusBadge Component

```vue
<AIStatusBadge :ai-enhancement="model.aiEnhancement" />
```

**Props:**
- `aiEnhancement`: Object containing `used`, `useCase`, and `modelVersion`

**Placement:**
- Header section (top-right corner)
- Consistent across all clinical explanation cards

### ExplainabilityCard Integration

The ExplainabilityCard includes multiple AI indicators:

1. **Header Badge**: Quick source identification
2. **Confidence Badge**: Purple banner showing AI confidence percentage (AI only)
3. **Fallback Notice**: Gray banner for system content
4. **Section Labels**: "AI" / "System" tags on summary sections
5. **Footer Status**: Text indicator ("AI-enhanced" / "Rule-based")

---

## Accessibility Considerations

### Screen Reader Support

All AI indicators include appropriate ARIA attributes:

```vue
<AIStatusBadge 
  :ai-enhancement="model.aiEnhancement"
  role="status"
  :aria-label="`AI-powered content generated using ${modelVersion}`"
/>
```

### Key Accessibility Features

1. **aria-live**: Status changes are announced
2. **role="status"**: Proper semantic meaning
3. **aria-hidden**: Decorative icons are hidden from screen readers
4. **Descriptive labels**: All indicators have clear text labels
5. **Color independence**: Icons provide visual distinction beyond color

### WCAG 2.1 Compliance

- Contrast ratios meet AA standards (4.5:1 minimum)
- Icons supplemented with text labels
- Focus indicators on interactive elements
- Semantic HTML structure

---

## UX Best Practices for Healthcare Professionals

### 1. Transparency
- Always clearly indicate AI vs. system content
- Never hide the source of clinical information
- Nurses must trust but verify AI suggestions

### 2. Confidence Communication
- Display AI confidence scores when available
- Higher confidence = stronger recommendation
- Low confidence = requires more clinical judgment

### 3. Trust Calibration
- AI badges remind users to exercise clinical judgment
- Safety notes emphasize verification
- Model version transparency builds trust

### 4. Fallback Gracefulness
- System-generated content should look equally professional
- Fallback notice is informational, not alarming
- No difference in clinical reliability

### 5. Consistency
- Same indicators across all clinical screens
- Same colors, icons, and labels everywhere
- Predictable UX reduces cognitive load

---

## Implementation Checklist

- [x] AIStatusBadge component created
- [x] ExplainabilityCard updated with indicators
- [x] Accessibility attributes added
- [x] Color scheme defined
- [x] Icon system implemented
- [x] Confidence display for AI content
- [x] Fallback notice for system content
- [x] Screen reader support verified
- [x] Documentation created

---

## Future Enhancements

1. **User Preferences**: Allow nurses to toggle AI indicators
2. **Detailed Model Info**: Expandable tooltip with model details
3. **Confidence History**: Show confidence trends over time
4. **AI Usage Analytics**: Track nurse interaction with AI features
5. **Customizable Alerts**: Configurable thresholds for confidence warnings
