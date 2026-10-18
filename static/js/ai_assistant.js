/**
 * LeadSync AI HR Assistant Controller (Powered by FreeLLMAPI)
 * Manages conversational state, suggested prompts, multi-turn context,
 * and safe HTML-sanitized rendering.
 */

(function () {
  'use strict';

  // AI Assistant State
  const chatState = {
    messages: [], // Array of { role: 'user' | 'assistant', content: string, timestamp: string }
    isSending: false,
    includeHrContext: true
  };

  // Safe HTML Entity Sanitizer (Guarantees zero XSS injection)
  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Safe Markdown Formatter (Applies markup ONLY to pre-escaped text)
  function formatSafeMarkdown(rawText) {
    if (!rawText) return '';
    const safe = escapeHTML(rawText);

    // Split lines for structured parsing
    const lines = safe.split('\n');
    let formattedHtml = '';
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      if (!line) {
        if (inList) {
          formattedHtml += '</ul>';
          inList = false;
        }
        continue;
      }

      // Headers (### Header)
      if (line.startsWith('### ')) {
        if (inList) { formattedHtml += '</ul>'; inList = false; }
        formattedHtml += `<h4 class="ai-msg-h4">${line.slice(4)}</h4>`;
        continue;
      }
      if (line.startsWith('## ')) {
        if (inList) { formattedHtml += '</ul>'; inList = false; }
        formattedHtml += `<h3 class="ai-msg-h3">${line.slice(3)}</h3>`;
        continue;
      }

      // Unordered List Items (- or * )
      if (line.startsWith('- ') || line.startsWith('* ')) {
        if (!inList) {
          formattedHtml += '<ul class="ai-msg-list">';
          inList = true;
        }
        let itemContent = line.slice(2);
        itemContent = applyInlineFormatting(itemContent);
        formattedHtml += `<li>${itemContent}</li>`;
        continue;
      }

      // Ordered List Items (1. )
      const numMatch = line.match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
        if (inList) { formattedHtml += '</ul>'; inList = false; }
        let itemContent = applyInlineFormatting(numMatch[2]);
        formattedHtml += `<div class="ai-msg-num-item"><strong>${numMatch[1]}.</strong> ${itemContent}</div>`;
        continue;
      }

      // Normal paragraph
      if (inList) {
        formattedHtml += '</ul>';
        inList = false;
      }
      formattedHtml += `<p class="ai-msg-p">${applyInlineFormatting(line)}</p>`;
    }

    if (inList) {
      formattedHtml += '</ul>';
    }

    return formattedHtml;
  }

  function applyInlineFormatting(text) {
    // Bold: **text**
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic: *text*
    text = text.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
    // Inline code: `code`
    text = text.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');
    return text;
  }

  // Render Messages
  function renderChatMessages() {
    const stream = document.getElementById('ai-chat-messages-stream');
    if (!stream) return;

    // Clear previous
    stream.innerHTML = '';

    if (chatState.messages.length === 0) {
      // Show Welcome Banner with Instructions
      const welcomeEl = document.createElement('div');
      welcomeEl.className = 'ai-chat-welcome';
      welcomeEl.innerHTML = `
        <div class="welcome-icon-box">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2">
            <path d="M12 2a8 8 0 0 0-8 8c0 3.37 2.1 6.25 5.09 7.4.4.08.75-.18.75-.56v-2.2c0-.3-.12-.6-.33-.81-1.63-1.63-1.63-4.27 0-5.9 1.63-1.63 4.27-1.63 5.9 0 .21.21.33.51.33.81v2.2c0 .38.35.64.75.56 3-1.15 5.09-4.03 5.09-7.4a8 8 0 0 0-8-8z"/>
            <circle cx="9" cy="9" r="1"/>
            <circle cx="15" cy="9" r="1"/>
          </svg>
        </div>
        <h3 style="margin: 8px 0 4px; font-size: 1.15rem; color: #1e293b;">LeadSync AI Operations &amp; HR Assistant</h3>
        <p style="margin: 0 0 16px; font-size: 0.88rem; color: #64748b; max-width: 520px; text-align: center;">
          I have full operational access to every LeadSync feature. Ask me to find employees, schedule assessments, evaluate suitability, appoint succession candidates, compare departments, or export reports.
        </p>
        <div class="ai-welcome-badge">
          ⚡ Direct Platform Access: Real Backend Operations &amp; Multi-Step Execution
        </div>
      `;
      stream.appendChild(welcomeEl);
      return;
    }

    // Render message items
    chatState.messages.forEach(msg => {
      const isUser = msg.role === 'user';
      const row = document.createElement('div');
      row.className = `ai-chat-row ${isUser ? 'user-row' : 'assistant-row'}`;

      const avatar = document.createElement('div');
      avatar.className = `ai-msg-avatar ${isUser ? 'user-avatar' : 'ai-avatar'}`;
      avatar.innerText = isUser ? 'HR' : 'AI';

      const bubble = document.createElement('div');
      bubble.className = `ai-msg-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`;

      if (isUser) {
        // Simple safe text for user
        bubble.textContent = msg.content;
      } else {
        // If executed actions exist, render action badges
        if (msg.executed_actions && msg.executed_actions.length > 0) {
          const actionsWrap = document.createElement('div');
          actionsWrap.className = 'ai-executed-actions-container';
          actionsWrap.style.cssText = 'margin-bottom: 8px; display: flex; flex-direction: column; gap: 4px;';

          msg.executed_actions.forEach(act => {
            const actBadge = document.createElement('div');
            actBadge.className = 'ai-action-chip';
            const isErr = act.status === 'error';
            actBadge.style.cssText = `display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 6px; font-size: 0.74rem; font-weight: 600; width: fit-content; background: ${isErr ? '#fef2f2' : '#f0fdf4'}; color: ${isErr ? '#b91c1c' : '#15803d'}; border: 1px solid ${isErr ? '#fecaca' : '#bbf7d0'};`;
            actBadge.innerHTML = `<span>${isErr ? '⚠️' : '⚡'}</span> <span><strong>${escapeHTML(act.tool_name)}:</strong> ${escapeHTML(act.summary || 'Executed')}</span>`;
            actionsWrap.appendChild(actBadge);
          });
          bubble.appendChild(actionsWrap);
        }

        // Safe formatted markdown for assistant
        const contentEl = document.createElement('div');
        contentEl.innerHTML = formatSafeMarkdown(msg.content);
        bubble.appendChild(contentEl);

        // Add human review advisory footer to AI messages
        const advisory = document.createElement('div');
        advisory.className = 'ai-msg-advisory';
        advisory.textContent = 'Decision-support suggestion • Requires HR review';
        bubble.appendChild(advisory);
      }

      // Timestamp
      const meta = document.createElement('div');
      meta.className = 'ai-msg-timestamp';
      meta.textContent = msg.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const bubbleWrap = document.createElement('div');
      bubbleWrap.className = 'ai-bubble-wrap';
      bubbleWrap.appendChild(bubble);
      bubbleWrap.appendChild(meta);

      row.appendChild(avatar);
      row.appendChild(bubbleWrap);
      stream.appendChild(row);
    });

    // Scroll to bottom
    stream.scrollTop = stream.scrollHeight;
  }

  // Send Chat Message
  async function handleSendUserMessage(customText) {
    const inputEl = document.getElementById('ai-chat-input-text');
    const textToSend = customText ? customText.trim() : (inputEl ? inputEl.value.trim() : '');

    if (!textToSend || chatState.isSending) return;

    // Clear input
    if (inputEl && !customText) {
      inputEl.value = '';
      inputEl.style.height = 'auto';
    }

    // Append User Message to local state
    const userMsg = {
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    chatState.messages.push(userMsg);
    renderChatMessages();

    // Show Loading Indicator
    setLoadingState(true);

    try {
      // Build messages array for API (exclude any previous service alerts or empty messages)
      const apiMessages = chatState.messages
        .filter(m => !m.isError && m.content && !m.content.startsWith('⚠️'))
        .map(m => ({
          role: m.role,
          content: m.content.trim()
        }))
        .filter(m => m.content.length > 0);

      // Call backend API (via api.sendAIChat)
      const res = await window.api.sendAIChat(apiMessages, chatState.includeHrContext);

      if (res.success && res.reply) {
        // Push Assistant Reply
        chatState.messages.push({
          role: 'assistant',
          content: res.reply,
          executed_actions: res.executed_actions || [],
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

        // Execute UI Action if returned by agent
        if (res.ui_action) {
          if (res.ui_action.action === 'navigate' && res.ui_action.target_tab) {
            if (typeof window.navigateToTab === 'function') {
              window.navigateToTab(res.ui_action.target_tab);
            }
          } else if (res.ui_action.action === 'refresh') {
            if (typeof window.loadAllInitialData === 'function') {
              window.loadAllInitialData();
            }
          }
        }
      } else {
        // Show error message as assistant bubble or toast
        const errMsg = res.error || 'Failed to receive a response from FreeLLMAPI.';
        chatState.messages.push({
          role: 'assistant',
          isError: true,
          content: `⚠️ **FreeLLMAPI Notice:** ${errMsg}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }

      // Update metrics ribbon if provided
      if (res.metrics_summary) {
        updateMetricsRibbon(res.metrics_summary);
      }

    } catch (err) {
      console.error('[AI Assistant] Request error:', err);
      let readableMsg = 'Unable to communicate with the AI backend.';
      if (typeof err === 'string' && err.trim()) {
        readableMsg = err.trim();
      } else if (err && typeof err.message === 'string' && err.message.trim() && err.message !== '[object Object]') {
        readableMsg = err.message.trim();
      } else if (err) {
        try {
          readableMsg = JSON.stringify(err);
        } catch (_) {
          readableMsg = String(err);
        }
      }
      if (readableMsg.includes('[object Object]')) {
        readableMsg = 'The AI backend returned an unformatted validation error. Please check server logs.';
      }

      chatState.messages.push({
        role: 'assistant',
        isError: true,
        content: `⚠️ **Service Alert:** ${readableMsg}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    } finally {
      setLoadingState(false);
      renderChatMessages();
    }
  }

  // Loading Indicator Toggle
  function setLoadingState(loading) {
    chatState.isSending = loading;
    const sendBtn = document.getElementById('ai-chat-btn-send');
    const loadingIndicator = document.getElementById('ai-chat-loading-indicator');
    const inputEl = document.getElementById('ai-chat-input-text');

    if (sendBtn) {
      sendBtn.disabled = loading;
    }
    if (inputEl) {
      inputEl.disabled = loading;
      if (!loading) inputEl.focus();
    }
    if (loadingIndicator) {
      loadingIndicator.style.display = loading ? 'flex' : 'none';
    }
  }

  // Clear Chat History
  function clearChatHistory() {
    chatState.messages = [];
    renderChatMessages();
  }

  // Update Metrics Ribbon
  function updateMetricsRibbon(metrics) {
    if (!metrics) return;
    const elHeadcount = document.getElementById('ai-ribbon-headcount');
    const elDepts = document.getElementById('ai-ribbon-depts');
    const elCompletion = document.getElementById('ai-ribbon-completion');
    const elAvgScore = document.getElementById('ai-ribbon-avg-score');

    if (elHeadcount) elHeadcount.textContent = metrics.workforce_headcount || 0;
    if (elDepts) elDepts.textContent = Object.keys(metrics.department_distribution || {}).length || 0;
    if (elCompletion) {
      const compPct = metrics.assessment_metrics?.completion_rate_pct ?? 0;
      elCompletion.textContent = `${compPct}%`;
    }
    if (elAvgScore) {
      const avg = metrics.assessment_metrics?.average_score_pct ?? 0;
      elAvgScore.textContent = `${avg}%`;
    }
  }

  // Suggested Prompts
  const SUGGESTED_PROMPTS = [
    { text: '🔍 Find employee 1', query: 'Find employee 1 and summarize their experience, role, and verified skills.' },
    { text: '📋 Show all assessments', query: 'Show every available assessment and schedule in the system.' },
    { text: '🎯 Analyze role suitability', query: 'Analyze employee 1 suitability for Senior Software Engineer.' },
    { text: '📊 Compare all departments', query: 'Compare all departments by headcount, experience, and assessment performance.' },
    { text: '📑 Export assessment report', query: 'Generate an assessment and talent readiness report for the executive team.' }
  ];

  function renderSuggestedPrompts() {
    const container = document.getElementById('ai-chat-suggested-chips');
    if (!container) return;

    container.innerHTML = '';
    SUGGESTED_PROMPTS.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ai-prompt-chip';
      btn.innerHTML = `<span>${item.text}</span>`;
      btn.onclick = () => handleSendUserMessage(item.query);
      container.appendChild(btn);
    });
  }

  // Auto-resize input
  function setupInputAutoResize() {
    const inputEl = document.getElementById('ai-chat-input-text');
    if (!inputEl) return;

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendUserMessage();
      }
    });

    inputEl.addEventListener('input', () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    });
  }

  // Initialize AI Assistant
  async function initAIAssistant() {
    renderSuggestedPrompts();
    renderChatMessages();
    setupInputAutoResize();

    const sendBtn = document.getElementById('ai-chat-btn-send');
    if (sendBtn) {
      sendBtn.addEventListener('click', () => handleSendUserMessage());
    }

    const clearBtn = document.getElementById('ai-chat-btn-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', clearChatHistory);
    }

    // Load initial metrics for ribbon
    try {
      if (window.api && window.api.getAIMetricsSummary) {
        const res = await window.api.getAIMetricsSummary();
        if (res.success && res.metrics) {
          updateMetricsRibbon(res.metrics);
        }
      }
    } catch (e) {
      // Ignored if unauthenticated or on initial load
    }
  }

  // Expose to window
  window.aiAssistant = {
    init: initAIAssistant,
    sendMessage: handleSendUserMessage,
    clearHistory: clearChatHistory,
    updateMetrics: updateMetricsRibbon
  };

  // Auto-run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAIAssistant);
  } else {
    initAIAssistant();
  }
})();
