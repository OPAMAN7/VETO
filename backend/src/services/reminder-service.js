'use strict';

const webPush = require('web-push');

function createPushService(config) {
  const isConfigured = Boolean(config.vapidPublicKey && config.vapidPrivateKey && config.vapidSubject);
  if (isConfigured) {
    webPush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  }

  return {
    isConfigured,
    publicKey: isConfigured ? config.vapidPublicKey : null,
    send(subscription, payload) {
      if (!isConfigured) {
        return Promise.reject(new Error('Web Push is not configured.'));
      }
      return webPush.sendNotification(subscription, JSON.stringify(payload), { TTL: 60 * 60 });
    }
  };
}

function startReminderScheduler(storePromise, pushService, intervalMs = 60000) {
  let running = false;

  async function deliverDueReminders() {
    if (running || !pushService.isConfigured) return;
    running = true;
    try {
      const store = await storePromise;
      const [reminders, subscriptions] = await Promise.all([
        store.listDueReminders(new Date().toISOString()),
        store.listSubscriptions()
      ]);
      if (subscriptions.length === 0) return;

      for (const reminder of reminders) {
        let delivered = false;
        for (const subscription of subscriptions) {
          try {
            await pushService.send(subscription, {
              title: 'VETO reminder',
              body: reminder.message || 'It is time to revisit a purchase decision.',
              url: '/history.html'
            });
            delivered = true;
          } catch (error) {
            if (error.statusCode === 404 || error.statusCode === 410) {
              await store.deleteSubscription(subscription.endpoint);
            } else {
              console.error('VETO could not deliver a reminder.', { code: error.code || 'PUSH_DELIVERY_FAILED' });
            }
          }
        }
        if (delivered) {
          await store.markReminderSent(reminder.id, new Date().toISOString());
        }
      }
    } catch (error) {
      console.error('VETO reminder scheduler failed.', { code: error.code || 'REMINDER_SCHEDULER_FAILED' });
    } finally {
      running = false;
    }
  }

  const intervalId = setInterval(deliverDueReminders, intervalMs);
  intervalId.unref();
  void deliverDueReminders();

  return {
    stop() {
      clearInterval(intervalId);
    },
    run: deliverDueReminders
  };
}

module.exports = { createPushService, startReminderScheduler };
