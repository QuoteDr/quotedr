(function(global) {
    'use strict';

    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var statePromise = null;

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function timezone() {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (_) { return 'UTC'; }
    }

    function accountId() {
        return typeof global.qdActiveAccountId === 'function' ? global.qdActiveAccountId() : null;
    }

    async function invoke(action, payload) {
        if (!global._supabase) throw new Error('Sign in to manage birthday rewards.');
        var body = Object.assign({}, payload || {}, { action: action });
        var selectedAccount = accountId();
        if (selectedAccount) body.accountId = selectedAccount;
        var result = await global._supabase.functions.invoke('birthday-rewards', { body: body });
        var responseBody = result && result.data;
        if (result.error || !responseBody || responseBody.error) {
            var error = new Error(responseBody && responseBody.error || result.error && result.error.message || 'Birthday rewards are temporarily unavailable.');
            error.code = responseBody && responseBody.code || 'birthday_rewards_unavailable';
            error.changeAvailableAt = responseBody && responseBody.changeAvailableAt;
            throw error;
        }
        return responseBody.data || null;
    }

    function load(force) {
        if (force || !statePromise) {
            statePromise = invoke('status').catch(function(error) {
                statePromise = null;
                throw error;
            });
        }
        return statePromise;
    }

    function monthOptions(selected) {
        return '<option value="">Month</option>' + MONTHS.map(function(name, index) {
            var value = index + 1;
            return '<option value="' + value + '"' + (Number(selected) === value ? ' selected' : '') + '>' + name + '</option>';
        }).join('');
    }

    function dayOptions(selected) {
        var options = '<option value="">Day</option>';
        for (var day = 1; day <= 31; day++) options += '<option value="' + day + '"' + (Number(selected) === day ? ' selected' : '') + '>' + day + '</option>';
        return options;
    }

    function setSelectors(prefix, profile) {
        var month = document.getElementById(prefix + 'Month');
        var day = document.getElementById(prefix + 'Day');
        if (month) month.innerHTML = monthOptions(profile && profile.birthMonth);
        if (day) day.innerHTML = dayOptions(profile && profile.birthDay);
    }

    async function saveBirthday(month, day) {
        month = Number(month);
        day = Number(day);
        if (!month && !day) return null;
        if (!month || !day) throw new Error('Choose both a birthday month and day, or leave both blank.');
        var data = await invoke('set_birthday', { birthMonth: month, birthDay: day, timezone: timezone() });
        statePromise = Promise.resolve(data);
        if (typeof global.qdBirthdayRewardStatus === 'function') global.qdBirthdayRewardStatus(true);
        return data;
    }

    async function saveOnboarding() {
        var month = document.getElementById('birthdayMonth');
        var day = document.getElementById('birthdayDay');
        if (!month || !day || (!month.value && !day.value)) return true;
        var message = document.getElementById('onboardingBirthdayMessage');
        try {
            await saveBirthday(month.value, day.value);
            if (message) {
                message.className = 'small text-success mt-2';
                message.textContent = 'Birthday saved. We only keep the month and day.';
            }
            return true;
        } catch (error) {
            if (message) {
                message.className = 'small text-danger mt-2';
                message.textContent = error.message;
            }
            return false;
        }
    }

    function rewardCopy(state) {
        if (state && state.plan === 'pro') return '$50 CAD off your next eligible Pro renewal';
        return 'seven consecutive days of Pro, activated when you choose';
    }

    function formatDate(value) {
        if (!value) return '';
        try { return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); } catch (_) { return String(value); }
    }

    function formatDateTime(value) {
        if (!value) return '';
        try { return new Date(value).toLocaleString(); } catch (_) { return String(value); }
    }

    function settingsStatusMarkup(state) {
        if (!state || !state.profile) return '<div class="small text-muted">Add a month and day to receive birthday wishes and one annual account gift. A birth year is never requested.</div>';
        var profile = state.profile;
        var parts = [
            '<div class="small"><strong>Saved birthday:</strong> ' + escapeHtml(MONTHS[Number(profile.birthMonth) - 1]) + ' ' + escapeHtml(profile.birthDay) + '</div>',
            '<div class="small text-muted">You can change it yourself again on ' + escapeHtml(formatDate(profile.selfServiceChangeAvailableAt)) + '. Customer service can help if it was entered incorrectly.</div>'
        ];
        if (state.activeProPass) parts.push('<div class="alert alert-success py-2 mt-3 mb-0"><strong>Birthday Pro pass active.</strong> Pro access ends ' + escapeHtml(formatDateTime(state.activeProPassEndsAt)) + '.</div>');
        if (state.latestClaim && state.latestClaim.rewardType === 'pro_renewal_credit') {
            var label = state.latestClaim.status === 'applied' ? 'applied to your next eligible renewal' : state.latestClaim.status === 'queued' ? 'reserved behind your current promotion' : state.latestClaim.status;
            parts.push('<div class="alert alert-success py-2 mt-3 mb-0"><strong>$50 CAD birthday credit:</strong> ' + escapeHtml(label) + '.</div>');
        }
        if (state.birthdayWindow && state.birthdayWindow.eligibleNow && state.claimCooldown && state.claimCooldown.blocked) {
            parts.push('<div class="alert alert-light border py-2 mt-3 mb-0">Happy birthday! This account already claimed its annual gift. The next claim is available after ' + escapeHtml(formatDate(state.claimCooldown.nextEligibleAt)) + '. If this looks wrong, contact customer service.</div>');
        }
        return parts.join('');
    }

    async function renderSettings() {
        var root = document.getElementById('birthdayRewardsSettings');
        if (!root) return;
        root.innerHTML = '<div class="text-muted small"><span class="spinner-border spinner-border-sm me-1"></span>Loading birthday rewards...</div>';
        try {
            var state = await load(true);
            root.innerHTML = '' +
                '<div class="row g-2 align-items-end">' +
                    '<div class="col-sm-5"><label class="form-label fw-semibold" for="settingsBirthdayMonth">Birthday month</label><select id="settingsBirthdayMonth" class="form-select"></select></div>' +
                    '<div class="col-sm-3"><label class="form-label fw-semibold" for="settingsBirthdayDay">Day</label><select id="settingsBirthdayDay" class="form-select"></select></div>' +
                    '<div class="col-sm-4"><button type="button" class="btn btn-outline-primary w-100" id="saveBirthdayButton"><i class="fas fa-cake-candles me-1"></i>Save birthday</button></div>' +
                '</div>' +
                '<div class="form-text mb-3">Optional. QuoteDr uses only the month and day to wish you a happy birthday and offer account gifts. Your birth year is not collected.</div>' +
                '<div id="birthdaySettingsStatus">' + settingsStatusMarkup(state) + '</div>' +
                (state && state.claimable ? '<button type="button" class="btn btn-success mt-3" id="claimBirthdayGiftButton"><i class="fas fa-gift me-1"></i>Activate my birthday gift</button><div class="form-text">Your gift is ' + escapeHtml(rewardCopy(state)) + '. It starts only when you activate it.</div>' : '');
            setSelectors('settingsBirthday', state && state.profile);
            document.getElementById('saveBirthdayButton').addEventListener('click', saveSettingsBirthday);
            var claim = document.getElementById('claimBirthdayGiftButton');
            if (claim) claim.addEventListener('click', claimGift);
        } catch (error) {
            root.innerHTML = '<div class="alert alert-warning mb-0">Birthday rewards could not be loaded. ' + escapeHtml(error.message) + '</div>';
        }
    }

    async function saveSettingsBirthday() {
        var button = document.getElementById('saveBirthdayButton');
        var status = document.getElementById('birthdaySettingsStatus');
        button.disabled = true;
        try {
            var state = await saveBirthday(document.getElementById('settingsBirthdayMonth').value, document.getElementById('settingsBirthdayDay').value);
            if (status) status.innerHTML = '<div class="alert alert-success py-2 mb-0">Birthday saved.</div>' + settingsStatusMarkup(state);
        } catch (error) {
            if (status) status.innerHTML = '<div class="alert alert-danger py-2 mb-0">' + escapeHtml(error.message) + '</div>';
        } finally {
            button.disabled = false;
        }
    }

    async function claimGift() {
        var state = await load(false);
        var prompt = 'Activate your birthday gift now? ' + rewardCopy(state) + '.';
        var approved = typeof global.qdConfirm === 'function'
            ? await global.qdConfirm(prompt, { title: 'Activate Birthday Gift', confirmText: 'Activate Gift', type: 'success' })
            : global.confirm(prompt);
        if (!approved) return;
        var button = document.getElementById('claimBirthdayGiftButton') || document.getElementById('dashboardBirthdayClaimButton');
        if (button) button.disabled = true;
        try {
            var next = await invoke('claim');
            statePromise = Promise.resolve(next);
            if (typeof global.qdBirthdayRewardStatus === 'function') global.qdBirthdayRewardStatus(true);
            await renderSettings();
            await renderDashboard();
            if (typeof global.qdAlert === 'function') await global.qdAlert('Your birthday gift is active. Happy birthday!', { title: 'Gift Activated', type: 'success' });
        } catch (error) {
            if (typeof global.qdAlert === 'function') await global.qdAlert(error.message, { title: 'Birthday Gift', type: 'warning' });
            else global.alert(error.message);
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function renderDashboard() {
        var root = document.getElementById('birthdayRewardDashboard');
        if (!root) return;
        root.innerHTML = '';
        try {
            var state = await load(true);
            if (!state) return;
            if (state.claimable) {
                root.innerHTML = '<div class="alert border-0 shadow-sm d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3" style="background:#fff4cc;border-left:5px solid #f4b400!important;">' +
                    '<div><div class="fw-bold fs-5"><i class="fas fa-gift me-2 text-warning"></i>Happy birthday from QuoteDr!</div><div>Your account gift is ' + escapeHtml(rewardCopy(state)) + '. It will not start until you activate it.</div></div>' +
                    '<button type="button" class="btn btn-success flex-shrink-0" id="dashboardBirthdayClaimButton">Activate gift</button>' +
                '</div>';
                document.getElementById('dashboardBirthdayClaimButton').addEventListener('click', claimGift);
            } else if (state.activeProPass) {
                root.innerHTML = '<div class="alert alert-success py-2"><i class="fas fa-gift me-1"></i><strong>Birthday Pro pass active</strong> until ' + escapeHtml(formatDateTime(state.activeProPassEndsAt)) + '.</div>';
            }
        } catch (error) {
            console.warn('Birthday dashboard card unavailable:', error);
        }
    }

    function initializeOnboarding() {
        setSelectors('birthday', null);
        load(false).then(function(state) {
            if (state && state.profile) setSelectors('birthday', state.profile);
        }).catch(function() {});
    }

    global.QuoteDrBirthdayRewards = {
        load: load,
        saveBirthday: saveBirthday,
        saveOnboarding: saveOnboarding,
        renderSettings: renderSettings,
        renderDashboard: renderDashboard,
        claimGift: claimGift,
        initializeOnboarding: initializeOnboarding
    };

    document.addEventListener('DOMContentLoaded', function() {
        if (document.getElementById('birthdayMonth')) initializeOnboarding();
        if (document.getElementById('birthdayRewardsSettings')) renderSettings();
        if (document.getElementById('birthdayRewardDashboard')) renderDashboard();
    });
})(window);
