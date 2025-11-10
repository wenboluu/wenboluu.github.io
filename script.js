// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Convert markdown-style bold and links to HTML
function processMarkdown(text) {
    if (!text) return '';
    let processed = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="bio-link">$1</a>');
    processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return processed;
}

// Load SVG icon with attributes (shared function for all icons)
async function loadSVGIconWithAttributes(path) {
    try {
        const response = await fetch(path);
        const svgText = await response.text();
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
        const svgElement = svgDoc.querySelector('svg');
        
        if (!svgElement) {
            return getDefaultIconData();
        }
        
        const content = Array.from(svgElement.children).map(child => child.outerHTML).join('');
        const viewBox = svgElement.getAttribute('viewBox') || '0 0 24 24';
        const fill = svgElement.getAttribute('fill') || 'currentColor';
        const stroke = svgElement.getAttribute('stroke') || 'none';
        const strokeWidth = svgElement.getAttribute('stroke-width') || '0';
        
        return { content, viewBox, fill, stroke, strokeWidth };
    } catch (error) {
        console.error(`Error loading SVG from ${path}:`, error);
        return getDefaultIconData();
    }
}

function getDefaultIconData() {
    return { content: '', viewBox: '0 0 24 24', fill: 'currentColor', stroke: 'none', strokeWidth: '0' };
}

// Get icon attributes with email icon special handling
function getIconAttributes(iconName, iconData) {
    const isEmail = iconName === 'email';
    return {
        fill: isEmail ? 'none' : iconData.fill,
        stroke: isEmail ? 'currentColor' : iconData.stroke,
        strokeWidth: isEmail ? '2' : iconData.strokeWidth,
        viewBox: iconData.viewBox
    };
}

// Create fade-in observer for elements
function createFadeInObserver(selector, options = {}) {
    const defaultOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observerOptions = { ...defaultOptions, ...options };
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    document.querySelectorAll(selector).forEach(item => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(30px)';
        item.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(item);
    });
}

// Update section title
function updateSectionTitle(selector, title) {
    const element = document.querySelector(selector);
    if (element && title) {
        element.textContent = title;
    }
}

// ============================================================================
// PARTICLE SYSTEM
// ============================================================================

function createParticles() {
    const particlesContainer = document.getElementById('particles');
    if (!particlesContainer) return;
    
    const particleCount = 50;
    const colors = ['#6366f1', '#8b5cf6', '#ec4899'];
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 20 + 's';
        particle.style.animationDuration = (15 + Math.random() * 10) + 's';
        
        const size = 2 + Math.random() * 3;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        
        particlesContainer.appendChild(particle);
    }
}

// ============================================================================
// NAVIGATION & SCROLL EFFECTS
// ============================================================================

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// Mobile navigation
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

if (hamburger) {
    hamburger.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        hamburger.classList.toggle('active');
    });
    
    // Close mobile menu when clicking on a link
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            navMenu.classList.remove('active');
            hamburger.classList.remove('active');
        });
    });
}

// Navbar scroll effect
const navbar = document.querySelector('.navbar');
window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    navbar.style.boxShadow = currentScroll <= 0 ? 'none' : '0 2px 20px rgba(0, 0, 0, 0.3)';
});

// Parallax effect for hero section (throttled)
let ticking = false;
const hero = document.querySelector('.hero');
window.addEventListener('scroll', () => {
    if (!ticking) {
        window.requestAnimationFrame(() => {
            const scrolled = window.pageYOffset;
            if (hero && scrolled < window.innerHeight) {
                hero.style.transform = `translateY(${scrolled * 0.5}px)`;
                hero.style.opacity = 1 - (scrolled / window.innerHeight) * 0.5;
            }
            ticking = false;
        });
        ticking = true;
    }
});

// ============================================================================
// DRAGGABLE PORTRAIT
// ============================================================================

function initDraggablePortrait() {
    const portrait = document.getElementById('portrait');
    const portraitImage = document.getElementById('portraitImage');
    
    if (!portrait || !portraitImage) return;
    
    let isDragging = false;
    let currentX, currentY, initialX, initialY;
    let xOffset = 0;
    let yOffset = 0;
    let animationFrame;
    let floatOffsetX = 0;
    let floatOffsetY = 0;
    let floatTime = 0;
    
    // Load saved position
    const savedPosition = localStorage.getItem('portraitPosition');
    if (savedPosition) {
        const pos = JSON.parse(savedPosition);
        xOffset = pos.x;
        yOffset = pos.y;
        portrait.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
    }
    
    // Floating animation
    function animate() {
        if (isDragging) {
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
                animationFrame = null;
            }
            return;
        }
        
        floatTime += 0.02;
        floatOffsetX = Math.sin(floatTime) * 10 + Math.cos(floatTime * 0.7) * 5;
        floatOffsetY = Math.cos(floatTime * 0.8) * 15 + Math.sin(floatTime * 1.2) * 5;
        
        portrait.style.transform = `translate(${xOffset + floatOffsetX}px, ${yOffset + floatOffsetY}px) rotate(${Math.sin(floatTime * 0.5) * 2}deg)`;
        animationFrame = requestAnimationFrame(animate);
    }
    
    function startFloating() {
        if (!animationFrame) {
            animate();
        }
    }
    
    function stopFloating() {
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
        floatOffsetX = 0;
        floatOffsetY = 0;
    }
    
    // Drag handlers
    function dragStart(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
        
        initialX = clientX - xOffset;
        initialY = clientY - yOffset;
        
        if (e.target === portrait || e.target === portraitImage || portrait.contains(e.target)) {
            isDragging = true;
            portrait.classList.add('dragging');
            stopFloating();
        }
    }
    
    function drag(e) {
        if (!isDragging) return;
        
        e.preventDefault();
        
        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
        
        currentX = clientX - initialX;
        currentY = clientY - initialY;
        
        // Constrain to viewport bounds
        const rect = portrait.getBoundingClientRect();
        const heroVisual = portrait.parentElement;
        const heroVisualRect = heroVisual.getBoundingClientRect();
        
        const maxX = (heroVisualRect.width - rect.width) / 2;
        const maxY = (heroVisualRect.height - rect.height) / 2;
        
        xOffset = Math.max(-maxX, Math.min(maxX, currentX));
        yOffset = Math.max(-maxY, Math.min(maxY, currentY));
        
        portrait.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
    }
    
    function dragEnd() {
        if (!isDragging) return;
        
        isDragging = false;
        portrait.classList.remove('dragging');
        localStorage.setItem('portraitPosition', JSON.stringify({ x: xOffset, y: yOffset }));
        setTimeout(startFloating, 100);
    }
    
    // Event listeners
    portrait.addEventListener('mousedown', dragStart);
    portrait.addEventListener('touchstart', dragStart, { passive: false });
    document.addEventListener('mousemove', drag);
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('touchend', dragEnd);
    
    // Prevent default image drag behavior
    portraitImage.addEventListener('dragstart', (e) => e.preventDefault());
    portraitImage.addEventListener('contextmenu', (e) => e.preventDefault());
    
    startFloating();
}

// ============================================================================
// DATA LOADING FUNCTIONS
// ============================================================================

async function loadSiteData() {
    try {
        const response = await fetch('data/site-data.yaml');
        const yamlText = await response.text();
        const data = jsyaml.load(yamlText);
        
        if (data.site?.title) {
            document.title = data.site.title;
        }
        
        const logoElement = document.querySelector('.logo-text');
        if (logoElement && data.site?.logo) {
            logoElement.textContent = data.site.logo;
        }
        
        await Promise.all([
            loadHeroSection(data.hero),
            loadAboutSection(data.about),
            loadResearchSection(data.research),
            loadContactSection(data.contact)
        ]);
        
        loadFooter(data.footer);
    } catch (error) {
        console.error('Error loading site data:', error);
    }
}

async function loadHeroSection(hero) {
    if (!hero) return;
    
    const heroTitle = document.querySelector('.hero-title .gradient-text');
    if (heroTitle && hero.name) {
        heroTitle.textContent = hero.name;
    }
    
    const heroDescription = document.querySelector('.hero-description');
    if (heroDescription && hero.description) {
        heroDescription.innerHTML = processMarkdown(hero.description.replace(/\n/g, '<br>'));
    }
    
    const heroInfo = document.querySelector('.hero-info');
    if (heroInfo && hero.bio) {
        heroInfo.innerHTML = hero.bio.map(para => 
            `<p class="hero-details">${processMarkdown(para)}</p>`
        ).join('');
    }
    
    const portraitImage = document.getElementById('portraitImage');
    if (portraitImage && hero.portrait) {
        portraitImage.src = hero.portrait;
        portraitImage.alt = hero.name || 'Portrait';
    }
    
    const heroSocial = document.querySelector('.hero-social');
    if (heroSocial && hero.social) {
        const iconHTMLs = await Promise.all(
            hero.social.map(async (social) => {
                const iconData = await loadSVGIconWithAttributes(`data/icons/${social.icon}.svg`);
                const attrs = getIconAttributes(social.icon, iconData);
                
                return `
                    <a href="${social.url}" target="_blank" class="social-link" aria-label="${social.name}">
                        <svg viewBox="${attrs.viewBox}" fill="${attrs.fill}" ${attrs.stroke !== 'none' ? `stroke="${attrs.stroke}" stroke-width="${attrs.strokeWidth}"` : ''}>
                            ${iconData.content}
                        </svg>
                        ${social.name}
                    </a>
                `;
            })
        );
        heroSocial.innerHTML = iconHTMLs.join('');
    }
}

function loadAboutSection(about) {
    if (!about) return;
    
    updateSectionTitle('#about .section-title', about.title);
    
    const aboutText = document.querySelector('.about-text');
    if (!aboutText) return;
    
    let html = '';
    if (about.paragraphs) {
        html += about.paragraphs.map(para => `<p>${processMarkdown(para)}</p>`).join('');
    }
    if (about.research_tags?.length > 0) {
        html += `<div class="research-areas">${about.research_tags.map(tag => `<div class="research-tag">${tag}</div>`).join('')}</div>`;
    }
    aboutText.innerHTML = html;
}

async function loadResearchSection(research) {
    if (!research) return;
    
    updateSectionTitle('#research .section-title', research.title);
    
    const researchGrid = document.querySelector('.research-grid');
    if (!researchGrid || !research.cards) return;
    
    const iconNames = [...new Set(research.cards.map(card => card.icon))];
    const iconData = {};
    
    await Promise.all(iconNames.map(async (iconName) => {
        iconData[iconName] = await loadSVGIconWithAttributes(`data/icons/${iconName}.svg`);
    }));
    
        researchGrid.innerHTML = research.cards.map(card => {
            const icon = iconData[card.icon] || getDefaultIconData();
            return `
                <div class="research-card">
                    <div class="card-icon">
                        <svg viewBox="${icon.viewBox}" fill="none">${icon.content}</svg>
                    </div>
                    <h3>${processMarkdown(card.title)}</h3>
                    <p>${processMarkdown(card.description)}</p>
                </div>
            `;
        }).join('');
    
    createFadeInObserver('.research-card');
}

async function loadContactSection(contact) {
    if (!contact) return;
    
    updateSectionTitle('#contact .section-title', contact.title);
    
    const contactContent = document.querySelector('.contact-content');
    if (!contactContent) return;
    
    let html = '';
    if (contact.message) {
        html += `<p>${processMarkdown(contact.message)}</p>`;
    }
    
    if (contact.links?.length > 0) {
        const iconHTMLs = await Promise.all(
            contact.links.map(async (link) => {
                const iconData = await loadSVGIconWithAttributes(`data/icons/${link.icon}.svg`);
                const attrs = getIconAttributes(link.icon, iconData);
                const targetAttr = link.url.startsWith('mailto:') ? '' : 'target="_blank"';
                
                return `
                    <a href="${link.url}" ${targetAttr} class="contact-link">
                        <svg viewBox="${attrs.viewBox}" fill="${attrs.fill}" ${attrs.stroke !== 'none' ? `stroke="${attrs.stroke}" stroke-width="${attrs.strokeWidth}"` : ''}>
                            ${iconData.content}
                        </svg>
                        ${link.name}
                    </a>
                `;
            })
        );
        html += `<div class="contact-links">${iconHTMLs.join('')}</div>`;
    }
    
    contactContent.innerHTML = html;
}

function loadFooter(footer) {
    if (!footer) return;
    
    const footerText = document.querySelector('.footer p');
    if (footerText && footer.text) {
        footerText.innerHTML = processMarkdown(footer.text);
    }
}

async function loadPublications() {
    try {
        const response = await fetch('data/publications/data/publications.yaml');
        const yamlText = await response.text();
        const data = jsyaml.load(yamlText);
        const publications = data.publications || [];
        
        const publicationsList = document.getElementById('publicationsList');
        if (!publicationsList) return;
        
        publicationsList.innerHTML = '';
        
        const placeholderSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150'%3E%3Crect fill='%236366f1' width='200' height='150'/%3E%3Ctext fill='white' font-family='Arial' font-size='20' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle'%3EPaper%3C/text%3E%3C/svg%3E`;
        
        publications.forEach(pub => {
            const authorsHtml = pub.authors.replace(/\bWenbo Lu\b/g, '<strong>Wenbo Lu</strong>');
            const publicationItem = document.createElement('div');
            publicationItem.className = 'publication-item';
            publicationItem.innerHTML = `
                <div class="publication-image">
                    <img src="${pub.image}" alt="Publication thumbnail" onerror="this.src='${placeholderSvg}'">
                </div>
                <div class="publication-content">
                    <h3 class="publication-title">
                        <a href="${pub.link}" target="_blank">${processMarkdown(pub.title)}</a>
                    </h3>
                    <p class="publication-authors">${processMarkdown(authorsHtml)}</p>
                    <p class="publication-venue">${processMarkdown(pub.venue)}</p>
                    <p class="publication-bib">${processMarkdown(pub.bib)}</p>
                </div>
            `;
            publicationsList.appendChild(publicationItem);
        });
        
        createFadeInObserver('.publication-item');
    } catch (error) {
        console.error('Error loading publications:', error);
        const publicationsList = document.getElementById('publicationsList');
        if (publicationsList) {
            publicationsList.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Error loading publications. Please check the publications data file.</p>';
        }
    }
}

// ============================================================================
// PROGRESS BAR (LEFT SIDE)
// ============================================================================

function initProgressBar() {
    const progressBar = document.getElementById('progressBar');
    const sections = ['home', 'research', 'publications', 'about', 'contact'];
    const sectionElements = sections.map(id => document.getElementById(id));
    const progressSections = document.querySelectorAll('.progress-section');
    
    function updateProgress() {
        const scrollTop = window.pageYOffset;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        
        // Calculate overall progress (vertical)
        const scrollableHeight = documentHeight - windowHeight;
        const progress = scrollableHeight > 0 ? (scrollTop / scrollableHeight) * 100 : 0;
        progressBar.style.height = `${Math.min(100, Math.max(0, progress))}%`;
        
        // Determine active section
        let activeSection = 'home';
        const scrollPosition = scrollTop + windowHeight / 2;
        
        sectionElements.forEach((section, index) => {
            if (!section) return;
            
            const rect = section.getBoundingClientRect();
            const sectionTop = rect.top + scrollTop;
            const sectionBottom = sectionTop + rect.height;
            
            if (scrollPosition >= sectionTop && scrollPosition < sectionBottom) {
                activeSection = sections[index];
            }
        });
        
        // Update section indicators
        progressSections.forEach((sectionEl, index) => {
            const sectionId = sections[index];
            sectionEl.classList.remove('active', 'completed');
            
            const currentIndex = sections.indexOf(activeSection);
            if (index === currentIndex) {
                sectionEl.classList.add('active');
            } else if (index < currentIndex) {
                sectionEl.classList.add('completed');
            }
        });
    }
    
    // Add click handlers to navigate to sections
    progressSections.forEach((sectionEl, index) => {
        sectionEl.addEventListener('click', () => {
            const sectionId = sections[index];
            const section = document.getElementById(sectionId);
            if (section) {
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
    
    // Throttle scroll events
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                updateProgress();
                ticking = false;
            });
            ticking = true;
        }
    });
    
    // Initial update
    updateProgress();
}

// ============================================================================
// INITIALIZATION
// ============================================================================

window.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([
        loadSiteData(),
        loadPublications().catch(err => console.error('Publications load error:', err))
    ]);
    
    createParticles();
    initDraggablePortrait();
    initProgressBar();
    
    const heroText = document.querySelector('.hero-text');
    if (heroText) {
        heroText.style.animation = 'fadeInUp 1s ease';
    }
});
