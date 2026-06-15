(function() {
  var endpoint = 'https://axmoffknvblluibuitrq.supabase.co/functions/v1/newsletter-signup';
  var anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso';

  function setStatus(form, message, tone) {
    var status = form.querySelector('[data-newsletter-status]');
    if (!status) return;
    status.textContent = message;
    status.className = 'newsletter-status ' + (tone || '');
  }

  function getSource(form) {
    return form.getAttribute('data-source') || window.location.pathname || 'marketing';
  }

  function wireForm(form) {
    form.addEventListener('submit', async function(event) {
      event.preventDefault();
      var emailInput = form.querySelector('input[type="email"]');
      var trap = form.querySelector('input[name="company"]');
      var button = form.querySelector('button[type="submit"]');
      var email = emailInput ? emailInput.value.trim() : '';

      if (trap && trap.value) {
        setStatus(form, 'Thanks, you are on the list.', 'success');
        return;
      }

      if (!email) {
        setStatus(form, 'Add your email first.', 'error');
        return;
      }

      if (button) button.disabled = true;
      setStatus(form, 'Signing you up...', '');

      try {
        var response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': anonKey
          },
          body: JSON.stringify({
            email: email,
            sourcePage: getSource(form),
            consentSource: 'quotedr_marketing_newsletter'
          })
        });
        var result = await response.json().catch(function() { return {}; });
        if (!response.ok) throw new Error(result.error || 'Signup failed');
        setStatus(form, result.alreadySubscribed ? 'You are already on the list.' : 'You are on the list. I will only send the useful stuff.', 'success');
        form.reset();
      } catch (err) {
        setStatus(form, 'Could not sign you up right now. You can also email support@quotedr.io.', 'error');
      } finally {
        if (button) button.disabled = false;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    Array.prototype.forEach.call(document.querySelectorAll('#newsletterSignupForm, [data-newsletter-signup]'), wireForm);
  });
})();
