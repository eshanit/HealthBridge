I've added a registration form to the session detail page. Here's what was implemented:

**Changes made:**

1. **Created** [`app/components/clinical/forms/RegistrationForm.vue`](app/components/clinical/forms/RegistrationForm.vue) - A new registration form component that collects:
   - Patient Id (not required)
   - Patient name (required)
   - Date of birth (required)
   - Gender (required)
   - Chief complaint
   - Additional notes

2. **Updated** [`app/services/sessionEngine.ts`](app/services/sessionEngine.ts:394) - Added `updateSession()` function to save patient registration data to the session.

3. **Updated** [`app/pages/sessions/[sessionId].vue`](app/pages/sessions/[sessionId].vue) - Modified the session detail page to:
   - Show a "Registration" tab when the session is in the "registration" stage
   - Display the registration form in that tab
   - Automatically advance to "assessment" stage after completing registration

**How it works:**
- When you create a new session, it starts at the "registration" stage
- The Registration tab will be active by default
- Fill in the patient information and click "Complete Registration"
- The session will advance to the "assessment
- You can" stage automatically then proceed with clinical assessment forms

There's also a "Skip (Demo)" button to test the flow without entering data.