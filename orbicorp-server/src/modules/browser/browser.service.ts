import { launch } from 'puppeteer';
import type { Browser, Page } from 'puppeteer';
import prisma from '../../shared/utils/prisma.js';

// Session timeout: 5 minutes
const SESSION_TIMEOUT = 5 * 60 * 1000;
const CLEANUP_INTERVAL = 60 * 1000; // Check every minute

interface BrowserSessionData {
  browser: Browser;
  page: Page;
  agentId: string;
  companyId: string;
  lastActivity: Date;
  currentUrl: string | null;
}

class BrowserService {
  private sessions: Map<string, BrowserSessionData> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup timer
    this.startCleanupTimer();
  }

  // ═══════════════════════════════════════════
  // SESSION MANAGEMENT
  // ═══════════════════════════════════════════

  private startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, CLEANUP_INTERVAL);
  }

  private async cleanupExpiredSessions() {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const elapsed = now - session.lastActivity.getTime();
      if (elapsed > SESSION_TIMEOUT) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      await this.closeSession(sessionId);
      console.log(`Browser session expired and closed: ${sessionId}`);
    }
  }

  async getOrCreateSession(agentId: string, companyId: string): Promise<string> {
    console.log('getOrCreateSession called:', { agentId, companyId });
    
    // Check if agent already has an active session
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.agentId === agentId) {
        // Update last activity
        session.lastActivity = new Date();
        console.log('Returning existing session:', sessionId);
        return sessionId;
      }
    }

    // Create new session
    const sessionId = `browser-${agentId}-${Date.now()}`;
    console.log('Creating new browser session:', sessionId);
    
    try {
      console.log('Launching puppeteer...');
      const browser = await launch({
        headless: true, // Run in headless mode
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
        ],
      });
      console.log('Puppeteer launched successfully');

      const page = await browser.newPage();
      console.log('New page created');
      
      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });

      // Set user agent to avoid bot detection
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Enable JavaScript
      await page.setJavaScriptEnabled(true);

      this.sessions.set(sessionId, {
        browser,
        page,
        agentId,
        companyId,
        lastActivity: new Date(),
        currentUrl: null,
      });
      console.log('Session stored in memory');

      // Save to database
      await prisma.browserSession.create({
        data: {
          id: sessionId,
          agentId,
          companyId,
          status: 'ACTIVE',
        },
      }).catch((err: unknown) => console.error('DB save error:', err));

      console.log(`New browser session created: ${sessionId}`);
      return sessionId;
    } catch (error) {
      console.error('Error in getOrCreateSession:', error);
      throw error;
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      await session.browser.close();
    } catch (error) {
      console.error(`Error closing browser session ${sessionId}:`, error);
    }

    this.sessions.delete(sessionId);

    // Update database
    await prisma.browserSession.update({
      where: { id: sessionId },
      data: { status: 'CLOSED' },
    }).catch(() => {});
  }

  private getSession(sessionId: string): BrowserSessionData {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Browser session bulunamadı veya süresi dolmuş');
    }
    session.lastActivity = new Date();
    return session;
  }

  // ═══════════════════════════════════════════
  // NAVIGATION
  // ═══════════════════════════════════════════

  async navigate(sessionId: string, url: string): Promise<{
    success: boolean;
    url: string;
    title: string;
    content: string;
  }> {
    const session = this.getSession(sessionId);
    const { page } = session;

    // URL doğrulama ve düzeltme
    let normalizedUrl = url.trim();

    // Protokol yoksa ekle
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      // Domain benzeri bir yapı varsa (örn: havucum.com, example.org) https ekle
      if (/^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}/.test(normalizedUrl)) {
        normalizedUrl = `https://${normalizedUrl}`;
      } else {
        throw new Error(`Geçersiz URL: "${url}". Lütfen geçerli bir URL girin (örn: https://example.com)`);
      }
    }

    try {
      await page.goto(normalizedUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      const title = await page.title();
      const content = await this.extractPageContent(page);

      session.currentUrl = normalizedUrl;

      // Update database
      await prisma.browserSession.update({
        where: { id: sessionId },
        data: { currentUrl: normalizedUrl, lastActivity: new Date() },
      }).catch(() => {});

      return {
        success: true,
        url: page.url(),
        title,
        content,
      };
    } catch (error) {
      throw new Error(`Sayfa yüklenemedi: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    }
  }

  // ═══════════════════════════════════════════
  // PAGE READING
  // ═══════════════════════════════════════════

  async readPage(sessionId: string): Promise<{
    url: string;
    title: string;
    content: string;
    forms: FormInfo[];
    buttons: ButtonInfo[];
    links: LinkInfo[];
  }> {
    const session = this.getSession(sessionId);
    const { page } = session;

    const url = page.url();
    const title = await page.title();
    const content = await this.extractPageContent(page);
    const forms = await this.extractForms(page);
    const buttons = await this.extractButtons(page);
    const links = await this.extractLinks(page);

    return { url, title, content, forms, buttons, links };
  }

  private async extractPageContent(page: Page): Promise<string> {
    return page.evaluate(() => {
      // Remove script and style tags
      const scripts = document.querySelectorAll('script, style, noscript');
      scripts.forEach(s => s.remove());

      // Get main content
      const main = document.querySelector('main, article, [role="main"], .main-content, #content');
      if (main) {
        return main.textContent?.trim().slice(0, 5000) || '';
      }

      // Fallback to body
      return document.body?.textContent?.trim().slice(0, 5000) || '';
    });
  }

  // ═══════════════════════════════════════════
  // FORM HANDLING
  // ═══════════════════════════════════════════

  async extractForms(page: Page): Promise<FormInfo[]> {
    return page.evaluate(() => {
      const forms: FormInfo[] = [];
      const formElements = document.querySelectorAll('form');

      formElements.forEach((form, formIndex) => {
        const fields: FieldInfo[] = [];

        // Get all input fields
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach((input, fieldIndex) => {
          const el = input as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
          const label = form.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() ||
                       el.getAttribute('placeholder') ||
                       el.getAttribute('name') ||
                       `field_${fieldIndex}`;

          fields.push({
            selector: `form:nth-of-type(${formIndex + 1}) [name="${el.name || el.id}"]`,
            name: el.name || el.id || `field_${fieldIndex}`,
            type: el.type || 'text',
            label,
            required: el.required,
            value: el.value,
          });
        });

        // Get submit button
        const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
        const submitSelector = submitBtn 
          ? `form:nth-of-type(${formIndex + 1}) button[type="submit"], form:nth-of-type(${formIndex + 1}) input[type="submit"]`
          : null;

        forms.push({
          id: form.id || `form_${formIndex}`,
          action: form.action,
          method: form.method || 'GET',
          fields,
          submitSelector,
        });
      });

      return forms;
    });
  }

  async fillForm(sessionId: string, fields: Record<string, string>): Promise<{
    success: boolean;
    filled: string[];
    failed: string[];
  }> {
    const session = this.getSession(sessionId);
    const { page } = session;

    const filled: string[] = [];
    const failed: string[] = [];

    for (const [selector, value] of Object.entries(fields)) {
      try {
        // Try to find the element
        const element = await page.$(selector);
        
        if (!element) {
          // Try by name attribute
          const byName = await page.$(`[name="${selector}"]`);
          if (!byName) {
            failed.push(selector);
            continue;
          }
          await this.fillField(page, `[name="${selector}"]`, value);
          filled.push(selector);
          continue;
        }

        await this.fillField(page, selector, value);
        filled.push(selector);
      } catch (error) {
        failed.push(selector);
      }
    }

    return { success: failed.length === 0, filled, failed };
  }

  private async fillField(page: Page, selector: string, value: string): Promise<void> {
    const element = await page.$(selector);
    if (!element) throw new Error(`Element bulunamadı: ${selector}`);

    // Clear existing value
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press('Backspace');

    // Type new value
    await page.type(selector, value, { delay: 50 });
  }

  async fillCardInfo(sessionId: string, cardInfo: {
    cardNumber: string;
    cardHolder: string;
    expiryMonth: string;
    expiryYear: string;
    cvv: string;
  }): Promise<{ success: boolean; message: string }> {
    const session = this.getSession(sessionId);
    const { page } = session;

    try {
      // Common card field selectors
      const cardSelectors = {
        number: [
          '[name="cardnumber"]', '[name="card-number"]', '[name="cc-number"]',
          '[autocomplete="cc-number"]', '[data-card-field="number"]',
          '#card-number', '#cardNumber', '.card-number',
        ],
        holder: [
          '[name="ccname"]', '[name="card-name"]', '[name="cardholder"]',
          '[autocomplete="cc-name"]', '[data-card-field="name"]',
          '#card-name', '#cardHolder', '.card-holder',
        ],
        expiry: [
          '[name="exp-date"]', '[name="cc-exp"]', '[name="expiry"]',
          '[autocomplete="cc-exp"]', '[data-card-field="expiry"]',
        ],
        expiryMonth: [
          '[name="exp-month"]', '[name="cc-exp-month"]', '[name="expiryMonth"]',
          '[autocomplete="cc-exp-month"]',
        ],
        expiryYear: [
          '[name="exp-year"]', '[name="cc-exp-year"]', '[name="expiryYear"]',
          '[autocomplete="cc-exp-year"]',
        ],
        cvv: [
          '[name="cvc"]', '[name="cvv"]', '[name="cc-csc"]', '[name="security-code"]',
          '[autocomplete="cc-csc"]', '[data-card-field="cvc"]',
          '#cvc', '#cvv', '.cvv',
        ],
      };

      // Try to fill card number
      let filled = false;
      for (const sel of cardSelectors.number) {
        try {
          const el = await page.$(sel);
          if (el) {
            await this.fillField(page, sel, cardInfo.cardNumber);
            filled = true;
            break;
          }
        } catch {}
      }

      if (!filled) {
        return { success: false, message: 'Kart numarası alanı bulunamadı' };
      }

      // Try to fill cardholder name
      for (const sel of cardSelectors.holder) {
        try {
          const el = await page.$(sel);
          if (el) {
            await this.fillField(page, sel, cardInfo.cardHolder);
            break;
          }
        } catch {}
      }

      // Try to fill expiry (combined or separate)
      let expiryFilled = false;
      
      // Try combined expiry first
      for (const sel of cardSelectors.expiry) {
        try {
          const el = await page.$(sel);
          if (el) {
            const expiry = `${cardInfo.expiryMonth}/${cardInfo.expiryYear}`;
            await this.fillField(page, sel, expiry);
            expiryFilled = true;
            break;
          }
        } catch {}
      }

      // Try separate month/year if combined didn't work
      if (!expiryFilled) {
        for (const sel of cardSelectors.expiryMonth) {
          try {
            const el = await page.$(sel);
            if (el) {
              await this.fillField(page, sel, cardInfo.expiryMonth);
              break;
            }
          } catch {}
        }
        for (const sel of cardSelectors.expiryYear) {
          try {
            const el = await page.$(sel);
            if (el) {
              await this.fillField(page, sel, cardInfo.expiryYear);
              break;
            }
          } catch {}
        }
      }

      // Try to fill CVV
      for (const sel of cardSelectors.cvv) {
        try {
          const el = await page.$(sel);
          if (el) {
            await this.fillField(page, sel, cardInfo.cvv);
            break;
          }
        } catch {}
      }

      return { success: true, message: 'Kart bilgileri forma girildi' };
    } catch (error) {
      return { 
        success: false, 
        message: `Kart bilgileri girilemedi: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}` 
      };
    }
  }

  // ═══════════════════════════════════════════
  // INTERACTION
  // ═══════════════════════════════════════════

  async click(sessionId: string, selector: string): Promise<{
    success: boolean;
    newUrl?: string;
    message: string;
  }> {
    const session = this.getSession(sessionId);
    const { page } = session;

    try {
      const oldUrl = page.url();

      // Wait for element and click
      await page.waitForSelector(selector, { timeout: 5000 });
      await page.click(selector);

      // Wait for potential navigation
      await page.waitForTimeout(1000);

      const newUrl = page.url();
      const navigated = oldUrl !== newUrl;

      if (navigated) {
        session.currentUrl = newUrl;
      }

      return {
        success: true,
        newUrl: navigated ? newUrl : undefined,
        message: navigated ? `Sayfaya yönlendirildi: ${newUrl}` : 'Tıklama başarılı',
      };
    } catch (error) {
      return {
        success: false,
        message: `Tıklama başarısız: ${error instanceof Error ? error.message : 'Element bulunamadı'}`,
      };
    }
  }

  async clickButton(sessionId: string, buttonText: string): Promise<{
    success: boolean;
    newUrl?: string;
    message: string;
  }> {
    const session = this.getSession(sessionId);
    const { page } = session;

    try {
      const oldUrl = page.url();

      // Find button by text
      const buttons = await page.$$('button, input[type="submit"], a.btn, a.button, [role="button"]');
      
      for (const button of buttons) {
        const text = await button.evaluate(el => el.textContent?.trim() || '');
        if (text.toLowerCase().includes(buttonText.toLowerCase())) {
          await button.click();
          
          // Wait for potential navigation
          await page.waitForTimeout(1000);
          
          const newUrl = page.url();
          const navigated = oldUrl !== newUrl;

          if (navigated) {
            session.currentUrl = newUrl;
          }

          return {
            success: true,
            newUrl: navigated ? newUrl : undefined,
            message: `"${buttonText}" butonuna tıklandı`,
          };
        }
      }

      return {
        success: false,
        message: `"${buttonText}" butonu bulunamadı`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Buton tıklama başarısız: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`,
      };
    }
  }

  async extractButtons(page: Page): Promise<ButtonInfo[]> {
    return page.evaluate(() => {
      const buttons: ButtonInfo[] = [];
      const buttonElements = document.querySelectorAll('button, input[type="submit"], a.btn, [role="button"]');

      buttonElements.forEach((btn, index) => {
        const text = btn.textContent?.trim() || (btn as HTMLInputElement).value || '';
        if (text) {
          buttons.push({
            text,
            selector: `button:nth-of-type(${index + 1})`,
            type: (btn as HTMLButtonElement).type || 'button',
          });
        }
      });

      return buttons.slice(0, 20); // Limit to 20 buttons
    });
  }

  async extractLinks(page: Page): Promise<LinkInfo[]> {
    return page.evaluate(() => {
      const links: LinkInfo[] = [];
      const linkElements = document.querySelectorAll('a[href]');

      linkElements.forEach((link) => {
        const text = link.textContent?.trim() || '';
        const href = (link as HTMLAnchorElement).href;
        if (text && href && !href.startsWith('javascript:')) {
          links.push({ text, href });
        }
      });

      return links.slice(0, 30); // Limit to 30 links
    });
  }

  // ═══════════════════════════════════════════
  // SCREENSHOT
  // ═══════════════════════════════════════════

  async screenshot(sessionId: string): Promise<Buffer> {
    const session = this.getSession(sessionId);
    const { page } = session;

    return page.screenshot({ type: 'png', fullPage: false }) as Promise<Buffer>;
  }

  // ═══════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════

  async closeAllSessions(): Promise<void> {
    for (const sessionId of this.sessions.keys()) {
      await this.closeSession(sessionId);
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}

// Type definitions
interface FormInfo {
  id: string;
  action: string;
  method: string;
  fields: FieldInfo[];
  submitSelector: string | null;
}

interface FieldInfo {
  selector: string;
  name: string;
  type: string;
  label: string;
  required: boolean;
  value: string;
}

interface ButtonInfo {
  text: string;
  selector: string;
  type: string;
}

interface LinkInfo {
  text: string;
  href: string;
}

export const browserService = new BrowserService();
export type { FormInfo, FieldInfo, ButtonInfo, LinkInfo };
