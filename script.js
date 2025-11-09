// Particle System for Diffusion Model Aesthetic
function createParticles() {
    const particlesContainer = document.getElementById('particles');
    const particleCount = 50;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        
        // Random starting position
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        
        // Random animation delay
        particle.style.animationDelay = Math.random() * 20 + 's';
        particle.style.animationDuration = (15 + Math.random() * 10) + 's';
        
        // Random size
        const size = 2 + Math.random() * 3;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        
        // Random color from gradient
        const colors = ['#6366f1', '#8b5cf6', '#ec4899'];
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        
        particlesContainer.appendChild(particle);
    }
}

// Smooth Scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Mobile Navigation
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

if (hamburger) {
    hamburger.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        hamburger.classList.toggle('active');
    });
}

// Close mobile menu when clicking on a link
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        hamburger.classList.remove('active');
    });
});

// Navbar scroll effect
let lastScroll = 0;
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll <= 0) {
        navbar.style.boxShadow = 'none';
    } else {
        navbar.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.3)';
    }
    
    lastScroll = currentScroll;
});

// Intersection Observer for fade-in animations is set up dynamically
// in loadResearchSection and loadPublications after content is loaded

// Draggable Portrait Functionality
function initDraggablePortrait() {
    const portrait = document.getElementById('portrait');
    const portraitImage = document.getElementById('portraitImage');
    
    if (!portrait || !portraitImage) return;
    
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;
    
    // Get initial position from saved data or center
    const savedPosition = localStorage.getItem('portraitPosition');
    if (savedPosition) {
        const pos = JSON.parse(savedPosition);
        xOffset = pos.x;
        yOffset = pos.y;
        portrait.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
    }
    
    // Add floating animation when not dragging
    let animationFrame;
    let floatOffsetX = 0;
    let floatOffsetY = 0;
    let floatTime = 0;
    
    function addFloatingAnimation() {
        if (isDragging) return;
        
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
        
        if (!animationFrame) {
            animate();
        }
    }
    
    // Remove floating animation
    function removeFloatingAnimation() {
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
        }
        floatOffsetX = 0;
        floatOffsetY = 0;
    }
    
    // Mouse events
    portrait.addEventListener('mousedown', dragStart);
    portrait.addEventListener('touchstart', dragStart, { passive: false });
    
    function dragStart(e) {
        // Prevent default image drag behavior
        e.preventDefault();
        e.stopPropagation();
        
        if (e.type === 'touchstart') {
            initialX = e.touches[0].clientX - xOffset;
            initialY = e.touches[0].clientY - yOffset;
        } else {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        }
        
        if (e.target === portrait || e.target === portraitImage || portrait.contains(e.target)) {
            isDragging = true;
            portrait.classList.add('dragging');
            removeFloatingAnimation();
        }
    }
    
    // Prevent image drag globally
    portraitImage.addEventListener('dragstart', (e) => {
        e.preventDefault();
        return false;
    });
    
    // Prevent context menu on image
    portraitImage.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });
    
    document.addEventListener('mousemove', drag);
    document.addEventListener('touchmove', drag, { passive: false });
    
    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            
            if (e.type === 'touchmove') {
                currentX = e.touches[0].clientX - initialX;
                currentY = e.touches[0].clientY - initialY;
            } else {
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
            }
            
            xOffset = currentX;
            yOffset = currentY;
            
            // Constrain to viewport bounds
            const rect = portrait.getBoundingClientRect();
            const heroVisual = portrait.parentElement;
            const heroVisualRect = heroVisual.getBoundingClientRect();
            
            const maxX = (heroVisualRect.width - rect.width) / 2;
            const maxY = (heroVisualRect.height - rect.height) / 2;
            
            xOffset = Math.max(-maxX, Math.min(maxX, xOffset));
            yOffset = Math.max(-maxY, Math.min(maxY, yOffset));
            
            portrait.style.transform = `translate(${xOffset}px, ${yOffset}px)`;
        }
    }
    
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('touchend', dragEnd);
    
    function dragEnd() {
        if (isDragging) {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
            portrait.classList.remove('dragging');
            
            // Save position
            localStorage.setItem('portraitPosition', JSON.stringify({ x: xOffset, y: yOffset }));
            
            // Restore floating animation after a delay
            setTimeout(addFloatingAnimation, 100);
        }
    }
    
    // Initialize floating animation
    addFloatingAnimation();
}

// Load Site Data from YAML
async function loadSiteData() {
    try {
        const response = await fetch('data/site-data.yaml');
        const yamlText = await response.text();
        const data = jsyaml.load(yamlText);
        
        // Update page title
        if (data.site?.title) {
            document.title = data.site.title;
        }
        
        // Update logo
        const logoElement = document.querySelector('.logo-text');
        if (logoElement && data.site?.logo) {
            logoElement.textContent = data.site.logo;
        }
        
        // Load hero section
        loadHeroSection(data.hero);
        
        // Load about section
        loadAboutSection(data.about);
        
        // Load research section
        await loadResearchSection(data.research);
        
        // Load contact section
        loadContactSection(data.contact);
        
        // Load footer
        loadFooter(data.footer);
        
    } catch (error) {
        console.error('Error loading site data:', error);
    }
}

// Helper function to convert markdown-style bold and links to HTML
function processMarkdown(text) {
    if (!text) return '';
    
    // Process links first: [text](url)
    let processed = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="bio-link">$1</a>');
    
    // Then process bold: **text**
    processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    return processed;
}

// Load Hero Section
function loadHeroSection(hero) {
    if (!hero) return;
    
    // Update hero name
    const heroTitle = document.querySelector('.hero-title .gradient-text');
    if (heroTitle && hero.name) {
        heroTitle.textContent = hero.name;
    }
    
    // Update hero description
    const heroDescription = document.querySelector('.hero-description');
    if (heroDescription && hero.description) {
        heroDescription.innerHTML = processMarkdown(hero.description.replace(/\n/g, '<br>'));
    }
    
    // Update hero bio
    const heroInfo = document.querySelector('.hero-info');
    if (heroInfo && hero.bio) {
        heroInfo.innerHTML = hero.bio.map(para => 
            `<p class="hero-details">${processMarkdown(para)}</p>`
        ).join('');
    }
    
    // Update portrait
    const portraitImage = document.getElementById('portraitImage');
    if (portraitImage && hero.portrait) {
        portraitImage.src = hero.portrait;
        portraitImage.alt = hero.name || 'Portrait';
    }
    
    // Update social links
    const heroSocial = document.querySelector('.hero-social');
    if (heroSocial && hero.social) {
        heroSocial.innerHTML = hero.social.map(social => {
            const icons = {
                github: `<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>`,
                linkedin: `<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>`,
                scholar: `<path d="M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14z"/>`,
                email: `<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>`
            };
            
            const iconPath = icons[social.icon] || icons.github;
            const viewBox = social.icon === 'email' ? '0 0 24 24' : '0 0 24 24';
            const fill = social.icon === 'email' ? 'none' : 'currentColor';
            const stroke = social.icon === 'email' ? 'currentColor' : 'none';
            const strokeWidth = social.icon === 'email' ? '2' : '0';
            
            return `
                <a href="${social.url}" target="_blank" class="social-link" aria-label="${social.name}">
                    <svg viewBox="${viewBox}" fill="${fill}" ${stroke !== 'none' ? `stroke="${stroke}" stroke-width="${strokeWidth}"` : ''}>
                        ${iconPath}
                    </svg>
                    ${social.name}
                </a>
            `;
        }).join('');
    }
}

// Load About Section
function loadAboutSection(about) {
    if (!about) return;
    
    const aboutTitle = document.querySelector('#about .section-title');
    if (aboutTitle && about.title) {
        aboutTitle.textContent = about.title;
    }
    
    const aboutText = document.querySelector('.about-text');
    if (aboutText) {
        let html = '';
        
        if (about.paragraphs) {
            html += about.paragraphs.map(para => 
                `<p>${processMarkdown(para)}</p>`
            ).join('');
        }
        
        if (about.research_tags && about.research_tags.length > 0) {
            html += `<div class="research-areas">${about.research_tags.map(tag => 
                `<div class="research-tag">${tag}</div>`
            ).join('')}</div>`;
        }
        
        aboutText.innerHTML = html;
    }
}

// Load SVG content from file
async function loadSVGIcon(path) {
    try {
        const response = await fetch(path);
        const svgText = await response.text();
        // Parse the SVG and extract the inner content (paths, groups, etc.)
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
        const svgElement = svgDoc.querySelector('svg');
        if (svgElement) {
            // Get all child elements (paths, groups, etc.) and convert to string
            return Array.from(svgElement.children).map(child => {
                // Replace fill="#000000" with fill="currentColor"
                const childClone = child.cloneNode(true);
                if (childClone.hasAttribute('fill') && childClone.getAttribute('fill') === '#000000') {
                    childClone.setAttribute('fill', 'currentColor');
                }
                // Also handle fill in child elements
                childClone.querySelectorAll('[fill="#000000"]').forEach(el => {
                    el.setAttribute('fill', 'currentColor');
                });
                return childClone.outerHTML;
            }).join('');
        }
        return '';
    } catch (error) {
        console.error(`Error loading SVG from ${path}:`, error);
        return '';
    }
}

// Load Research Section
async function loadResearchSection(research) {
    if (!research) return;
    
    const researchTitle = document.querySelector('#research .section-title');
    if (researchTitle && research.title) {
        researchTitle.textContent = research.title;
    }
    
    const researchGrid = document.querySelector('.research-grid');
    if (researchGrid && research.cards) {
        // Get all unique icon names from cards
        const iconNames = [...new Set(research.cards.map(card => card.icon))];
        
        // Load all icons from data directory
        const iconSvgs = {};
        const iconConfigs = {};
        
        await Promise.all(iconNames.map(async (iconName) => {            
            let iconContent = '';
            let svgViewBox = '0 0 24 24';
            
            try {
                const path = `data/research/${iconName}.svg`;
                const response = await fetch(path);
                if (response.ok) {
                    const svgText = await response.text();
                    const parser = new DOMParser();
                    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
                    const svgElement = svgDoc.querySelector('svg');
                    
                    if (svgElement) {
                        // Get viewBox from the SVG
                        const viewBox = svgElement.getAttribute('viewBox');
                        if (viewBox) {
                            svgViewBox = viewBox;
                        }
                        
                        // Extract inner content without any modifications
                        iconContent = Array.from(svgElement.children).map(child => {
                            return child.outerHTML;
                        }).join('');
                    }
                }
            } catch (error) {
                console.error(`Error loading icon ${iconName}:`, error);
            }
            
            iconSvgs[iconName] = iconContent;
            iconConfigs[iconName] = {
                viewBox: svgViewBox
            };
        }));
        
        researchGrid.innerHTML = research.cards.map(card => {
            const iconSvg = iconSvgs[card.icon] || '';
            const config = iconConfigs[card.icon] || { viewBox: '0 0 24 24' };
            
            return `
                <div class="research-card">
                    <div class="card-icon">
                        <svg viewBox="${config.viewBox}">
                            ${iconSvg}
                        </svg>
                    </div>
                    <h3>${processMarkdown(card.title)}</h3>
                    <p>${processMarkdown(card.description)}</p>
                </div>
            `;
        }).join('');
        
        // Add fade-in animation to research cards
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };
        
        const cardObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, observerOptions);
        
        document.querySelectorAll('.research-card').forEach(card => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(30px)';
            card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            cardObserver.observe(card);
        });
    }
}

// Load Contact Section
function loadContactSection(contact) {
    if (!contact) return;
    
    const contactTitle = document.querySelector('#contact .section-title');
    if (contactTitle && contact.title) {
        contactTitle.textContent = contact.title;
    }
    
    const contactContent = document.querySelector('.contact-content');
    if (contactContent) {
        let html = '';
        
        if (contact.message) {
            html += `<p>${processMarkdown(contact.message)}</p>`;
        }
        
        if (contact.links && contact.links.length > 0) {
            const icons = {
                github: `<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>`,
                linkedin: `<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>`,
                scholar: `<path d="M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14z"/>`,
                email: `<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>`
            };
            
            html += `<div class="contact-links">${contact.links.map(link => {
                const iconPath = icons[link.icon] || icons.email;
                const viewBox = '0 0 24 24';
                const fill = link.icon === 'email' ? 'none' : 'currentColor';
                const stroke = link.icon === 'email' ? 'currentColor' : 'none';
                const strokeWidth = link.icon === 'email' ? '2' : '0';
                
                return `
                    <a href="${link.url}" ${link.url.startsWith('mailto:') ? '' : 'target="_blank"'} class="contact-link">
                        <svg viewBox="${viewBox}" fill="${fill}" ${stroke !== 'none' ? `stroke="${stroke}" stroke-width="${strokeWidth}"` : ''}>
                            ${iconPath}
                        </svg>
                        ${link.name}
                    </a>
                `;
            }).join('')}</div>`;
        }
        
        contactContent.innerHTML = html;
    }
}

// Load Footer
function loadFooter(footer) {
    if (!footer) return;
    
    const footerText = document.querySelector('.footer p');
    if (footerText && footer.text) {
        footerText.innerHTML = processMarkdown(footer.text);
    }
}

// Load Publications from YAML
async function loadPublications() {
    try {
        const response = await fetch('data/publications/data/publications.yaml');
        const yamlText = await response.text();
        const data = jsyaml.load(yamlText);
        const publications = data.publications || [];
        
        const publicationsList = document.getElementById('publicationsList');
        if (!publicationsList) return;
        
        publicationsList.innerHTML = '';
        
        publications.forEach(pub => {
            // Bold the author name "Wenbo Lu" in the authors string
            let authorsHtml = pub.authors.replace(/\bWenbo Lu\b/g, '<strong>Wenbo Lu</strong>');
            
            // Create placeholder SVG if image fails to load
            const placeholderSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='150'%3E%3Crect fill='%236366f1' width='200' height='150'/%3E%3Ctext fill='white' font-family='Arial' font-size='20' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle'%3EPaper%3C/text%3E%3C/svg%3E`;
            
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
                    <p class="publication-authors">
                        ${processMarkdown(authorsHtml)}
                    </p>
                    <p class="publication-venue">
                        ${processMarkdown(pub.venue)}
                    </p>
                    <p class="publication-bib">
                        ${processMarkdown(pub.bib)}
                    </p>
                </div>
            `;
            
            publicationsList.appendChild(publicationItem);
        });
        
        // Add fade-in animation to publications
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

        document.querySelectorAll('.publication-item').forEach(item => {
            item.style.opacity = '0';
            item.style.transform = 'translateY(30px)';
            item.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(item);
        });
        
    } catch (error) {
        console.error('Error loading publications:', error);
        const publicationsList = document.getElementById('publicationsList');
        if (publicationsList) {
            publicationsList.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Error loading publications. Please check the publications data file.</p>';
        }
    }
}

// Initialize particles on load
window.addEventListener('DOMContentLoaded', async () => {
    // Load data in parallel for better performance
    const [siteDataResult] = await Promise.all([
        loadSiteData(),
        // Start loading publications in parallel
        loadPublications().catch(err => console.error('Publications load error:', err))
    ]);
    
    // Initialize UI after data loads
    createParticles();
    initDraggablePortrait();
    
    // Add fade-in to hero content
    const heroText = document.querySelector('.hero-text');
    if (heroText) {
        heroText.style.animation = 'fadeInUp 1s ease';
    }
});

// Hover effects are handled by CSS

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
