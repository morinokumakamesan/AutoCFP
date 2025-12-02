// Conference Calendar Application
class ConferenceCalendar {
    constructor() {
        this.conferences = [];
        this.filteredConferences = [];
        this.months = [];
        this.currentFilters = {
            themes: new Set(), // Empty set means all themes
            search: ''
        };

        this.init();
    }

    async init() {
        try {
            await this.loadData();
            this.setupEventListeners();
            this.setupStickyHeader();
            this.generateMonths();
            this.applyFilters(); // Apply filters to populate filteredConferences
        } catch (error) {
            console.error('Failed to initialize calendar:', error);
            this.showError('データの読み込みに失敗しました。');
        }
    }

    updateMonthsWrapperWidth(monthsWrapper, calendarWrapper) {
        if (!monthsWrapper) return;

        const monthsClone = monthsWrapper.firstChild;
        if (!monthsClone) return;

        const wrapperRect = calendarWrapper.getBoundingClientRect();
        const conferenceColumnHeader = document.querySelector('.conference-column-header');
        const conferenceColumnWidth = conferenceColumnHeader ? conferenceColumnHeader.offsetWidth : 300;

        // Calculate the actual content width of months
        const actualMonthsWidth = monthsClone.scrollWidth || monthsClone.offsetWidth;

        // Calculate the maximum available width (from conference column end to calendar wrapper end)
        const maxAvailableWidth = wrapperRect.width - conferenceColumnWidth;

        // Set wrapper width to the smaller of actual content width or available width
        monthsWrapper.style.width = Math.min(actualMonthsWidth, maxAvailableWidth) + 'px';
    }

    setupStickyHeader() {
        const calendarHeader = document.querySelector('.calendar-header');
        const calendarWrapper = document.querySelector('.calendar-wrapper');
        const monthsHeader = document.querySelector('.months-container');
        const conferenceColumnHeader = document.querySelector('.conference-column-header');

        if (!calendarHeader || !calendarWrapper || !monthsHeader || !conferenceColumnHeader) return;

        let headerTop = null;
        let isFixed = false;

        // Create a wrapper for months to clip overflow on the left
        let monthsWrapper = null;

        const handleScroll = () => {
            if (headerTop === null) {
                headerTop = calendarWrapper.getBoundingClientRect().top + window.scrollY;
            }

            const scrollY = window.scrollY;

            if (scrollY >= headerTop) {
                if (!isFixed) {
                    const wrapperLeft = calendarWrapper.getBoundingClientRect().left;

                    // Create wrapper for months header if not exists
                    if (!monthsWrapper) {
                        // Get the actual header height and conference column width dynamically
                        const headerHeight = calendarHeader.offsetHeight;
                        const conferenceColumnWidth = conferenceColumnHeader.offsetWidth;
                        const leftPosition = wrapperLeft + conferenceColumnWidth;

                        monthsWrapper = document.createElement('div');
                        monthsWrapper.style.position = 'fixed';
                        monthsWrapper.style.top = '0';
                        monthsWrapper.style.left = leftPosition + 'px';
                        monthsWrapper.style.height = headerHeight + 'px';
                        monthsWrapper.style.overflow = 'hidden';
                        monthsWrapper.style.zIndex = '101';
                        monthsWrapper.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                        monthsWrapper.style.display = 'block'; // Block container
                        document.body.appendChild(monthsWrapper);

                        // Clone months header into wrapper
                        const monthsClone = monthsHeader.cloneNode(true);
                        monthsClone.style.position = 'absolute'; // Use absolute positioning
                        monthsClone.style.top = '0';
                        monthsClone.style.left = '0';
                        monthsClone.style.visibility = 'visible';
                        monthsClone.style.height = '100%';
                        monthsClone.style.display = 'flex';
                        monthsClone.style.minWidth = 'unset';
                        monthsClone.style.width = 'auto';
                        monthsWrapper.appendChild(monthsClone);

                        // Set height for all month-header elements
                        const monthHeaders = monthsClone.querySelectorAll('.month-header');
                        monthHeaders.forEach(header => {
                            header.style.height = '100%';
                            header.style.flexShrink = '0'; // Prevent individual headers from shrinking
                        });

                        // Calculate and set wrapper width based on visible content
                        this.updateMonthsWrapperWidth(monthsWrapper, calendarWrapper);
                    }

                    // Hide only the months container in the original header
                    monthsHeader.style.visibility = 'hidden';

                    // Ensure conference name column stays on top
                    conferenceColumnHeader.style.position = 'fixed';
                    conferenceColumnHeader.style.top = '0';
                    conferenceColumnHeader.style.left = wrapperLeft + 'px';
                    conferenceColumnHeader.style.zIndex = '102';
                    conferenceColumnHeader.style.visibility = 'visible';

                    isFixed = true;
                }

                // Scroll the cloned months header content inside wrapper
                if (monthsWrapper) {
                    const monthsClone = monthsWrapper.firstChild;
                    if (monthsClone) {
                        const scrollOffset = Math.max(0, calendarWrapper.scrollLeft);
                        monthsClone.style.transform = `translateX(-${scrollOffset}px)`;
                        this.updateMonthsWrapperWidth(monthsWrapper, calendarWrapper);
                    }
                }
            } else {
                if (isFixed) {
                    // Remove wrapper
                    if (monthsWrapper && monthsWrapper.parentNode) {
                        monthsWrapper.parentNode.removeChild(monthsWrapper);
                        monthsWrapper = null;
                    }

                    monthsHeader.style.visibility = '';
                    conferenceColumnHeader.style.position = '';
                    conferenceColumnHeader.style.top = '';
                    conferenceColumnHeader.style.left = '';
                    conferenceColumnHeader.style.zIndex = '';
                    conferenceColumnHeader.style.visibility = '';

                    isFixed = false;
                }
            }
        };

        const handleWrapperScroll = () => {
            if (isFixed && monthsWrapper) {
                const monthsClone = monthsWrapper.firstChild;
                if (monthsClone) {
                    const scrollOffset = Math.max(0, calendarWrapper.scrollLeft);
                    monthsClone.style.transform = `translateX(-${scrollOffset}px)`;
                    this.updateMonthsWrapperWidth(monthsWrapper, calendarWrapper);
                }
            }
        };

        window.addEventListener('scroll', handleScroll);
        calendarWrapper.addEventListener('scroll', handleWrapperScroll);
        window.addEventListener('resize', () => {
            headerTop = null;
            if (monthsWrapper && monthsWrapper.parentNode) {
                monthsWrapper.parentNode.removeChild(monthsWrapper);
                monthsWrapper = null;
            }
            isFixed = false;
            handleScroll();
        });
    }

    async loadData() {
        try {
            // Try to load conferences_with_cfp.json first, fallback to conferences_base.json
            let response = await fetch('data/conferences_with_cfp.json');
            if (!response.ok) {
                response = await fetch('data/conferences_base.json');
            }

            const data = await response.json();
            this.conferences = data.conferences || [];

            // Populate theme filter
            const themes = data.themes || [];
            this.populateThemeFilter(themes);

            // Update last updated time
            if (data.last_updated) {
                document.getElementById('lastUpdated').textContent = data.last_updated;
            }

            console.log(`Loaded ${this.conferences.length} conferences`);
        } catch (error) {
            console.error('Error loading data:', error);
            throw error;
        }
    }

    populateThemeFilter(themes) {
        const themeCheckboxes = document.getElementById('themeCheckboxes');
        themeCheckboxes.innerHTML = '';

        // Initialize with all themes selected
        this.currentFilters.themes = new Set(themes);

        themes.forEach(theme => {
            const label = document.createElement('label');
            label.style.marginRight = '15px';
            label.style.cursor = 'pointer';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = theme;
            checkbox.checked = true;

            const themeText = document.createTextNode(' ' + this.stripThemePrefix(theme));

            label.appendChild(checkbox);
            label.appendChild(themeText);
            themeCheckboxes.appendChild(label);
        });
    }

    setupEventListeners() {
        // Select all themes button
        document.getElementById('selectAllThemes').addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('#themeCheckboxes input[type="checkbox"]');
            checkboxes.forEach(cb => cb.checked = true);

            const checkedThemes = Array.from(checkboxes).map(cb => cb.value);
            this.currentFilters.themes = new Set(checkedThemes);
            this.applyFilters();
        });

        // Deselect all themes button
        document.getElementById('deselectAllThemes').addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('#themeCheckboxes input[type="checkbox"]');
            checkboxes.forEach(cb => cb.checked = false);

            this.currentFilters.themes = new Set();
            this.applyFilters();
        });

        // Theme checkboxes
        document.getElementById('themeCheckboxes').addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                const checkedThemes = Array.from(
                    document.querySelectorAll('#themeCheckboxes input[type="checkbox"]:checked')
                ).map(cb => cb.value);

                this.currentFilters.themes = new Set(checkedThemes);
                this.applyFilters();
            }
        });

        // Search
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.currentFilters.search = e.target.value.toLowerCase();
            this.applyFilters();
        });
    }

    generateMonths() {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-11

        // Determine current fiscal year (April to March)
        // If current month is Jan-Mar (0-2), we're in fiscal year that started last year
        // If current month is Apr-Dec (3-11), we're in fiscal year that started this year
        const fiscalYearStart = currentMonth >= 3 ? currentYear : currentYear - 1;

        // Generate from April of current fiscal year to March of next fiscal year end
        // Example: Nov 2025 (fiscal year 2025) → April 2025 to March 2027
        const startDate = new Date(fiscalYearStart, 3, 1); // April 1 of fiscal year
        const endDate = new Date(fiscalYearStart + 2, 2, 31); // March 31 of next fiscal year

        // Calculate total months
        const totalMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12
                          + (endDate.getMonth() - startDate.getMonth()) + 1;

        this.months = [];
        this.currentMonthIndex = (currentYear - fiscalYearStart) * 12 + (currentMonth - 3);

        for (let i = 0; i < totalMonths; i++) {
            const date = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
            this.months.push({
                year: date.getFullYear(),
                month: date.getMonth() + 1,
                label: `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`,
                date: date
            });
        }
    }

    applyFilters() {
        this.filteredConferences = this.conferences.filter(conf => {
            // Theme filter - only show conferences with selected themes
            // If no themes are selected, show nothing
            if (this.currentFilters.themes.size === 0) {
                return false; // No themes selected = hide all
            }

            // Support both single theme (string) and multiple themes (array)
            const confThemes = Array.isArray(conf.themes) ? conf.themes : [conf.theme];

            // Check if any of the conference's themes match selected themes
            const hasMatchingTheme = confThemes.some(theme =>
                this.currentFilters.themes.has(theme)
            );

            if (!hasMatchingTheme) {
                return false; // Conference themes not in selected themes
            }

            // Search filter
            if (this.currentFilters.search) {
                const searchLower = this.currentFilters.search;
                const nameMatch = (conf.name || '').toLowerCase().includes(searchLower);
                const shortNameMatch = (conf.short_name || '').toLowerCase().includes(searchLower);
                const themeMatch = confThemes.some(theme =>
                    (theme || '').toLowerCase().includes(searchLower)
                );

                if (!nameMatch && !shortNameMatch && !themeMatch) {
                    return false;
                }
            }

            return true;
        });

        this.renderCalendar();
    }

    renderCalendar() {
        this.renderMonthHeaders();
        this.renderConferenceRows();
        // Use setTimeout to ensure DOM is fully rendered before syncing widths
        setTimeout(() => {
            this.syncHeaderAndBodyWidth();
        }, 0);
        this.scrollToCurrentMonth();
    }

    syncHeaderAndBodyWidth() {
        const calendarHeader = document.querySelector('.calendar-header');
        const calendarBody = document.querySelector('.calendar-body');
        const calendarContainer = document.querySelector('.calendar-container');
        const conferenceColumnHeader = document.querySelector('.conference-column-header');
        const monthsContainer = document.querySelector('.months-container');
        const monthHeaders = monthsContainer ? monthsContainer.querySelectorAll('.month-header') : [];
        
        if (calendarHeader && calendarBody && calendarContainer && conferenceColumnHeader && monthsContainer && monthHeaders.length > 0) {
            // Calculate actual months width by summing up individual month-header widths
            let actualMonthsWidth = 0;
            const monthHeaderWidths = [];
            monthHeaders.forEach((header, index) => {
                const width = header.offsetWidth;
                monthHeaderWidths[index] = width;
                actualMonthsWidth += width;
            });
            
            // Set months-container width to actual content width
            monthsContainer.style.width = actualMonthsWidth + 'px';
            
            // Sync month-column widths to match month-header widths
            const monthColumns = document.querySelectorAll('.month-column');
            monthColumns.forEach((column, index) => {
                if (monthHeaderWidths[index] !== undefined) {
                    column.style.width = monthHeaderWidths[index] + 'px';
                    column.style.minWidth = monthHeaderWidths[index] + 'px';
                }
            });
            
            // Sync conference-timeline widths to match actual months width
            const conferenceTimelines = document.querySelectorAll('.conference-timeline');
            conferenceTimelines.forEach(timeline => {
                timeline.style.width = actualMonthsWidth + 'px';
            });
            
            // Sync conference-row widths to match header width
            const conferenceRows = document.querySelectorAll('.conference-row');
            const conferenceColumnWidth = conferenceColumnHeader.offsetWidth;
            const headerWidth = conferenceColumnWidth + actualMonthsWidth;
            conferenceRows.forEach(row => {
                row.style.width = headerWidth + 'px';
            });
            
            // Set container width to match header width to prevent extra space
            calendarContainer.style.width = headerWidth + 'px';
            // Set body width to match header width to prevent extra space on the right
            calendarBody.style.width = headerWidth + 'px';
        }
    }

    scrollToCurrentMonth() {
        // Scroll to current month on initial load
        if (this.currentMonthIndex !== undefined) {
            const calendarWrapper = document.querySelector('.calendar-wrapper');
            const monthWidth = 150; // min-width of month-column
            const conferenceInfoWidth = 300; // width of conference-info column

            // Calculate scroll position to show current month
            const scrollLeft = this.currentMonthIndex * monthWidth;

            // Scroll to current month
            setTimeout(() => {
                calendarWrapper.scrollLeft = scrollLeft;
            }, 100);
        }
    }

    renderMonthHeaders() {
        const monthsHeader = document.getElementById('monthsHeader');
        monthsHeader.innerHTML = '';

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // 1-12

        this.months.forEach(month => {
            const monthDiv = document.createElement('div');
            monthDiv.className = 'month-header';

            // Highlight current month
            if (month.year === currentYear && month.month === currentMonth) {
                monthDiv.classList.add('current-month');
            }

            monthDiv.textContent = month.label;
            monthsHeader.appendChild(monthDiv);
        });
    }

    renderConferenceRows() {
        const conferencesList = document.getElementById('conferencesList');
        conferencesList.innerHTML = '';

        if (this.filteredConferences.length === 0) {
            const noDataDiv = document.createElement('div');
            noDataDiv.className = 'no-data';
            noDataDiv.style.padding = '40px';
            noDataDiv.style.textAlign = 'center';
            noDataDiv.textContent = '該当する会議が見つかりませんでした。';
            conferencesList.appendChild(noDataDiv);
            return;
        }

        // Group by conference name to combine different paper types
        const groupedConferences = this.groupConferencesByName(this.filteredConferences);

        groupedConferences.forEach(group => {
            const row = this.createConferenceRow(group);
            conferencesList.appendChild(row);
        });
    }

    groupConferencesByName(conferences) {
        // Conferences are already merged, just pass through with information structure intact
        return conferences.map(conf => {
            return {
                name: conf.name,
                short_name: conf.short_name,
                theme: conf.theme,  // Keep for backward compatibility
                themes: conf.themes,  // New field for multiple themes
                rank: conf.rank,
                url: conf.url,
                paperTypes: conf.paper_types || [],
                information: conf.information  // Keep the year-organized structure
            };
        });
    }

    stripThemePrefix(theme) {
        // Remove number prefix like "01.", "02.", "19 ", etc. from theme names
        if (!theme) return theme;
        // Match patterns like "01.", "02.", "19 " (with or without dot, with or without space)
        return theme.replace(/^\d+[\.\s]+/, '').trim();
    }

    createConferenceRow(conference) {
        const row = document.createElement('div');
        row.className = 'conference-row';

        // Conference info column
        const infoDiv = document.createElement('div');
        infoDiv.className = 'conference-info';

        // Short name with rank (main heading)
        const nameDiv = document.createElement('div');
        nameDiv.className = 'conference-name-row';

        const shortNameSpan = document.createElement('span');
        shortNameSpan.className = 'conference-name';
        if (conference.url) {
            const link = document.createElement('a');
            link.href = conference.url;
            link.target = '_blank';
            link.textContent = conference.short_name;
            link.style.color = 'inherit';
            link.style.textDecoration = 'none';
            shortNameSpan.appendChild(link);
        } else {
            shortNameSpan.textContent = conference.short_name;
        }

        // Rank badge next to name
        const rankBadge = document.createElement('span');
        rankBadge.className = `badge badge-rank-${conference.rank}`;
        rankBadge.textContent = conference.rank;

        nameDiv.appendChild(rankBadge);
        nameDiv.appendChild(shortNameSpan);

        // Full name (subtitle)
        const fullNameDiv = document.createElement('div');
        fullNameDiv.className = 'conference-full-name';
        fullNameDiv.textContent = conference.name;

        // Meta info (theme and flagship)
        const metaDiv = document.createElement('div');
        metaDiv.className = 'conference-meta';

        // Theme badges - support both single theme (string) and multiple themes (array)
        const confThemes = Array.isArray(conference.themes) ? conference.themes : [conference.theme];
        confThemes.forEach(theme => {
            if (theme) {
                const themeBadge = document.createElement('span');
                themeBadge.className = 'badge badge-theme';
                themeBadge.textContent = this.stripThemePrefix(theme);
                metaDiv.appendChild(themeBadge);
            }
        });

        // Flagship badge
        if (conference.flagship) {
            const flagshipBadge = document.createElement('span');
            flagshipBadge.className = 'badge badge-flagship';
            flagshipBadge.textContent = 'Flagship';
            metaDiv.appendChild(flagshipBadge);
        }

        infoDiv.appendChild(nameDiv);
        infoDiv.appendChild(fullNameDiv);
        infoDiv.appendChild(metaDiv);

        // Timeline columns
        const timelineDiv = document.createElement('div');
        timelineDiv.className = 'conference-timeline';

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1; // 1-12

        this.months.forEach(month => {
            const monthColumn = document.createElement('div');
            monthColumn.className = 'month-column';

            // Highlight current month
            if (month.year === currentYear && month.month === currentMonth) {
                monthColumn.classList.add('current-month');
            }

            // Find deadlines in this month
            const deadlinesInMonth = this.getDeadlinesInMonth(conference, month);

            deadlinesInMonth.forEach(deadline => {
                const marker = this.createDeadlineMarker(deadline);
                monthColumn.appendChild(marker);
            });

            timelineDiv.appendChild(monthColumn);
        });

        row.appendChild(infoDiv);
        row.appendChild(timelineDiv);

        return row;
    }

    getDeadlinesInMonth(conference, month) {
        const deadlines = [];

        // Need to track which year each deadline belongs to
        // by iterating through the information structure
        if (conference.information) {
            Object.keys(conference.information).forEach(confYear => {
                const yearInfo = conference.information[confYear];

                // Check deadlines for this conference year
                if (yearInfo.deadlines) {
                    yearInfo.deadlines.forEach(deadline => {
                        if (deadline.date) {
                            const deadlineDate = new Date(deadline.date);
                            if (deadlineDate.getFullYear() === month.year &&
                                deadlineDate.getMonth() + 1 === month.month) {
                                // Add conference name and year to deadline
                                deadlines.push({
                                    ...deadline,
                                    conferenceName: conference.short_name,
                                    conferenceYear: confYear  // Store the actual conference year
                                });
                            }
                        }
                    });
                }

                // Check conference dates for this year
                if (yearInfo.conference_dates && yearInfo.conference_dates.start) {
                    const startDate = new Date(yearInfo.conference_dates.start);
                    if (startDate.getFullYear() === month.year &&
                        startDate.getMonth() + 1 === month.month) {
                        deadlines.push({
                            type: 'conference',
                            date: yearInfo.conference_dates.start,
                            endDate: yearInfo.conference_dates.end,
                            label: 'Conference Date',
                            is_predicted: yearInfo.is_predicted || false,
                            conferenceName: conference.short_name,
                            conferenceYear: confYear  // Store the actual conference year
                        });
                    }
                }
            });
        }

        return deadlines;
    }

    createDeadlineMarker(deadline) {
        const marker = document.createElement('div');
        marker.className = `deadline-marker deadline-${deadline.type}`;

        if (deadline.is_predicted) {
            marker.classList.add('deadline-predicted');
        }

        // Format date
        let dateStr;
        if (deadline.type === 'conference' && deadline.endDate) {
            // Conference date with start and end
            const startDate = new Date(deadline.date);
            const endDate = new Date(deadline.endDate);
            dateStr = `${startDate.getMonth() + 1}/${startDate.getDate()}-${endDate.getMonth() + 1}/${endDate.getDate()}`;
        } else {
            // Regular deadline
            const date = new Date(deadline.date);
            dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
        }

        marker.textContent = dateStr;

        // Remove default tooltip
        marker.title = '';

        // Add hover handler
        marker.addEventListener('mouseenter', (e) => {
            this.showDeadlineDetails(marker, deadline);
        });

        marker.addEventListener('mouseleave', (e) => {
            // Keep popup open briefly to allow moving cursor to popup
            setTimeout(() => {
                const popup = document.querySelector('.deadline-detail-popup');
                if (popup && !popup.matches(':hover') && !marker.matches(':hover')) {
                    popup.remove();
                }
            }, 100);
        });

        // Add click/touch handler for mobile
        marker.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showDeadlineDetails(marker, deadline);
        });

        // Debug: log if text is empty
        if (!dateStr || dateStr === 'NaN/NaN') {
            console.warn('Invalid date for deadline:', deadline);
        }

        return marker;
    }

    showDeadlineDetails(markerElement, deadline) {
        // Remove any existing detail popup
        const existingPopup = document.querySelector('.deadline-detail-popup');
        if (existingPopup) {
            existingPopup.remove();
        }

        // Create popup
        const popup = document.createElement('div');
        popup.className = 'deadline-detail-popup';

        // Use the original label from WikiCFP (already in English)
        const typeLabel = deadline.label;

        // Extract year from deadline data (use the conferenceYear we stored)
        let yearInfo = '';
        if (deadline.conferenceYear && deadline.conferenceName) {
            // Use the actual conference year from the data structure
            if (deadline.type === 'conference') {
                yearInfo = `<div class="deadline-detail-year">Conference: ${deadline.conferenceName} ${deadline.conferenceYear}</div>`;
            } else {
                yearInfo = `<div class="deadline-detail-year">For: ${deadline.conferenceName} ${deadline.conferenceYear}</div>`;
            }
        }

        popup.innerHTML = `
            <div class="deadline-detail-header">${typeLabel}</div>
            ${yearInfo}
            ${deadline.is_predicted ? '<div class="deadline-detail-note">Predicted</div>' : ''}
        `;

        // Position popup near the marker
        const rect = markerElement.getBoundingClientRect();
        popup.style.position = 'fixed';
        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.bottom + 5}px`;

        document.body.appendChild(popup);

        // Keep popup open when hovering over it
        popup.addEventListener('mouseenter', () => {
            popup.classList.add('popup-hover');
        });

        popup.addEventListener('mouseleave', () => {
            popup.remove();
        });

        // Close popup when clicking outside
        setTimeout(() => {
            document.addEventListener('click', function closePopup() {
                popup.remove();
                document.removeEventListener('click', closePopup);
            });
        }, 100);
    }

    showError(message) {
        const conferencesList = document.getElementById('conferencesList');
        conferencesList.innerHTML = `
            <div style="padding: 40px; text-align: center; color: #e74c3c;">
                <h3>エラー</h3>
                <p>${message}</p>
            </div>
        `;
    }
}

// Initialize calendar when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ConferenceCalendar();
});
