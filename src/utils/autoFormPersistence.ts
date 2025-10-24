// Auto-form persistence script
// This script automatically adds form persistence attributes to existing forms

export function addFormPersistenceToExistingForms() {
  // Find all forms in the application
  const forms = document.querySelectorAll('form');
  
  forms.forEach((form, index) => {
    // Add data-form-key attribute if not present
    if (!form.getAttribute('data-form-key')) {
      const formId = form.id || `form-${index}`;
      form.setAttribute('data-form-key', formId);
    }
    
    // Add auto-save class
    form.classList.add('auto-save-form');
    
    // Add form persistence event listeners
    addFormPersistenceListeners(form);
  });
}

function addFormPersistenceListeners(form: HTMLFormElement) {
  const formKey = form.getAttribute('data-form-key') || 'unknown-form';
  
  // Save form data on input change
  const handleInputChange = () => {
    saveFormData(form, formKey);
  };
  
  // Save form data on form submit
  const handleFormSubmit = () => {
    saveFormData(form, formKey);
  };
  
  // Add event listeners
  form.addEventListener('input', handleInputChange);
  form.addEventListener('change', handleInputChange);
  form.addEventListener('submit', handleFormSubmit);
  
  // Restore form data on load
  restoreFormData(form, formKey);
}

function saveFormData(form: HTMLFormElement, formKey: string) {
  try {
    const formData: any = {};
    
    // Extract all form data
    const inputs = form.querySelectorAll('input, textarea, select');
    inputs.forEach((input) => {
      const element = input as HTMLInputElement;
      const name = element.name || element.id;
      
      if (name) {
        if (element.type === 'checkbox') {
          formData[name] = element.checked;
        } else if (element.type === 'radio') {
          if (element.checked) {
            formData[name] = element.value;
          }
        } else {
          formData[name] = element.value;
        }
      }
    });
    
    // Save to localStorage
    localStorage.setItem(`form_${formKey}`, JSON.stringify({
      data: formData,
      timestamp: Date.now()
    }));
    
    // Mark form as having unsaved changes
    form.classList.add('has-unsaved-changes');
  } catch (error) {
    console.error('Error saving form data:', error);
  }
}

function restoreFormData(form: HTMLFormElement, formKey: string) {
  try {
    const savedData = localStorage.getItem(`form_${formKey}`);
    if (!savedData) return;
    
    const { data: formData, timestamp } = JSON.parse(savedData);
    
    // Check if data is not too old (24 hours)
    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(`form_${formKey}`);
      return;
    }
    
    // Restore form data
    Object.entries(formData).forEach(([key, value]) => {
      const element = form.querySelector(`[name="${key}"], #${key}`) as HTMLInputElement;
      if (element) {
        if (element.type === 'checkbox') {
          element.checked = Boolean(value);
        } else if (element.type === 'radio') {
          element.checked = element.value === value;
        } else {
          element.value = String(value);
        }
        
        // Trigger change event
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    
    // Remove unsaved changes class
    form.classList.remove('has-unsaved-changes');
  } catch (error) {
    console.error('Error restoring form data:', error);
  }
}

// Initialize form persistence when DOM is ready
export function initializeFormPersistence() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addFormPersistenceToExistingForms);
  } else {
    addFormPersistenceToExistingForms();
  }
  
  // Re-initialize when new forms are added
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          if (element.tagName === 'FORM' || element.querySelector('form')) {
            addFormPersistenceToExistingForms();
          }
        }
      });
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// CSS for form persistence indicators
export const formPersistenceCSS = `
  .auto-save-form {
    position: relative;
  }
  
  .auto-save-form.has-unsaved-changes::before {
    content: "●";
    color: #f59e0b;
    position: absolute;
    top: 10px;
    right: 10px;
    font-size: 12px;
    z-index: 10;
  }
  
  .auto-save-form.saving::before {
    content: "⏳";
    color: #3b82f6;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

// Add CSS to document
export function addFormPersistenceCSS() {
  const style = document.createElement('style');
  style.textContent = formPersistenceCSS;
  document.head.appendChild(style);
}

// Export all functions
export default {
  addFormPersistenceToExistingForms,
  initializeFormPersistence,
  addFormPersistenceCSS,
  formPersistenceCSS
};
