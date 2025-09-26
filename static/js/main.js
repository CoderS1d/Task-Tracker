// Get the default schedule from Python
const default_schedule = JSON.parse(document.getElementById('scheduleData').textContent);

// Function to load and display the weekly schedule
async function loadWeeklySchedule() {
    try {
        const response = await fetch('/get_schedule');
        const schedule = await response.json();
        const weeklyScheduleEl = document.getElementById('weeklySchedule');
        weeklyScheduleEl.innerHTML = '';

        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        days.forEach((day, index) => {
            const daySchedule = schedule[day] || [];
            const accordionItem = document.createElement('div');
            accordionItem.className = 'accordion-item';
            
            accordionItem.innerHTML = `
                <h2 class="accordion-header" id="heading${day}">
                    <button class="accordion-button collapsed" type="button" 
                            data-bs-toggle="collapse" data-bs-target="#collapse${day}">
                        ${day} (${daySchedule.length} items)
                    </button>
                </h2>
                <div id="collapse${day}" class="accordion-collapse collapse" 
                     data-bs-parent="#weeklySchedule">
                    <div class="accordion-body">
                        <div class="schedule-items">
                            ${daySchedule.map(item => `
                                <div class="schedule-item d-flex justify-content-between align-items-center mb-2">
                                    <span class="schedule-time badge bg-secondary me-2">${item.time}</span>
                                    <span class="schedule-task flex-grow-1">${item.task}</span>
                                    <div class="schedule-actions">
                                        <button class="btn btn-sm btn-outline-primary edit-schedule me-2" 
                                                data-day="${day}" 
                                                data-time="${item.time}" 
                                                data-task="${item.task}">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn btn-sm btn-outline-danger delete-schedule" 
                                                data-day="${day}" 
                                                data-time="${item.time}" 
                                                data-task="${item.task}">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                            ${daySchedule.length === 0 ? '<p class="text-muted">No scheduled items</p>' : ''}
                        </div>
                    </div>
                </div>
            `;
            
            weeklyScheduleEl.appendChild(accordionItem);
        });

        // Add event listeners for delete and edit buttons
        document.querySelectorAll('.delete-schedule').forEach(button => {
            button.addEventListener('click', async (e) => {
                const day = e.target.closest('.delete-schedule').dataset.day;
                const time = e.target.closest('.delete-schedule').dataset.time;
                const task = e.target.closest('.delete-schedule').dataset.task;

                if (confirm('Are you sure you want to delete this schedule item?')) {
                    await deleteScheduleItem(day, time, task);
                }
            });
        });

        document.querySelectorAll('.edit-schedule').forEach(button => {
            button.addEventListener('click', async (e) => {
                const day = e.target.closest('.edit-schedule').dataset.day;
                const time = e.target.closest('.edit-schedule').dataset.time;
                const task = e.target.closest('.edit-schedule').dataset.task;
                
                // Set original values in hidden fields
                document.getElementById('scheduleOriginalDay').value = day;
                document.getElementById('scheduleOriginalTime').value = time;
                document.getElementById('scheduleOriginalTask').value = task;
                
                // Set current values in form
                document.getElementById('scheduleDay').value = day;
                document.getElementById('scheduleTime').value = time;
                document.getElementById('scheduleTask').value = task;
                
                // Update modal title and button text
                document.querySelector('#addScheduleModal .modal-title').textContent = 'Edit Schedule Item';
                document.getElementById('saveSchedule').textContent = 'Update Schedule';
                
                // Show modal
                new bootstrap.Modal(document.getElementById('addScheduleModal')).show();
            });
        });
    } catch (error) {
        console.error('Error loading weekly schedule:', error);
    }
}

// Function to add a new schedule item
async function addScheduleItem() {
    const day = document.getElementById('scheduleDay').value;
    const time = document.getElementById('scheduleTime').value;
    const task = document.getElementById('scheduleTask').value;

    if (!day || !time || !task) return;

    try {
        const response = await fetch('/manage_schedule', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'add',
                day,
                time,
                task
            }),
        });

        if (response.ok) {
            // Reset form and close modal
            document.getElementById('addScheduleForm').reset();
            bootstrap.Modal.getInstance(document.getElementById('addScheduleModal')).hide();
            
            // Refresh all displays
            await Promise.all([
                loadWeeklySchedule(),
                calendar.refetchEvents(),
                updateDailySchedule() // Always update daily schedule
            ]);
        }
    } catch (error) {
        console.error('Error adding schedule item:', error);
    }
}

// Function to check if the daily schedule should be updated
function shouldUpdateDailySchedule(originalDay = null, newDay = null) {
    const currentDay = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
    const daysToCheck = new Set([currentDay]);
    
    if (originalDay) daysToCheck.add(originalDay);
    if (newDay) daysToCheck.add(newDay);
    
    // If either the original day, new day, or current day is affected, return true
    return daysToCheck.size > 1;
}

// Function to delete a schedule item
async function deleteScheduleItem(day, time, task) {
    try {
        const response = await fetch('/manage_schedule', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'delete',
                day,
                time,
                task
            }),
        });

        if (response.ok) {
            // Refresh schedule displays
            await Promise.all([
                loadWeeklySchedule(),
                calendar.refetchEvents(),
                updateDailySchedule() // Always update daily schedule
            ]);
        }
    } catch (error) {
        console.error('Error deleting schedule item:', error);
    }
}

// Function to edit schedule item
async function editScheduleItem() {
    const originalDay = document.getElementById('scheduleOriginalDay').value;
    const originalTime = document.getElementById('scheduleOriginalTime').value;
    const originalTask = document.getElementById('scheduleOriginalTask').value;
    
    const day = document.getElementById('scheduleDay').value;
    let time;
    const task = document.getElementById('scheduleTask').value;
    
    // Get selected time option
    const timeOption = document.querySelector('input[name="timeOption"]:checked').value;
    
    switch(timeOption) {
        case 'keep':
            time = originalTime;
            break;
        case 'preset':
            time = document.getElementById('scheduleTime').value;
            break;
        case 'custom':
            const startTime = formatTimeString(document.getElementById('customStartTime').value);
            const endTime = formatTimeString(document.getElementById('customEndTime').value);
            if (!startTime || !endTime) {
                alert('Please select both start and end times.');
                return;
            }
            time = `${startTime}-${endTime}`;
            break;
    }

    if (!day || !time || !task) return;

    try {
        const response = await fetch('/manage_schedule', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'edit',
                originalDay,
                originalTime,
                originalTask,
                day,
                time,
                task
            }),
        });

        if (response.ok) {
            // Reset form and close modal
            document.getElementById('addScheduleForm').reset();
            document.getElementById('scheduleOriginalDay').value = '';
            document.getElementById('scheduleOriginalTime').value = '';
            document.getElementById('scheduleOriginalTask').value = '';
            document.querySelector('#addScheduleModal .modal-title').textContent = 'Add Schedule Item';
            document.getElementById('saveSchedule').textContent = 'Save Schedule';
            bootstrap.Modal.getInstance(document.getElementById('addScheduleModal')).hide();
            
            // Refresh all displays
            await Promise.all([
                loadWeeklySchedule(),
                calendar.refetchEvents(),
                updateDailySchedule() // Always update daily schedule
            ]);
        }
    } catch (error) {
        console.error('Error editing schedule item:', error);
    }
}

// Function to format time string to 24h format
function formatTimeString(timeStr) {
    return timeStr.padStart(5, '0');  // Ensures format like "09:00"
}

document.addEventListener('DOMContentLoaded', function() {
    // Initialize time selection radio buttons
    document.querySelectorAll('input[name="timeOption"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const presetSection = document.getElementById('presetTimeSection');
            const customSection = document.getElementById('customTimeSection');
            const keepOption = document.getElementById('keepExistingTime');
            
            // Only show "Keep existing time" for edit mode
            keepOption.style.display = document.getElementById('scheduleOriginalTime').value ? 'block' : 'none';
            
            switch(this.value) {
                case 'keep':
                    presetSection.style.display = 'none';
                    customSection.style.display = 'none';
                    // Restore original time
                    document.getElementById('scheduleTime').value = document.getElementById('scheduleOriginalTime').value;
                    break;
                case 'preset':
                    presetSection.style.display = 'block';
                    customSection.style.display = 'none';
                    break;
                case 'custom':
                    presetSection.style.display = 'none';
                    customSection.style.display = 'block';
                    break;
            }
        });
    });

    // Initialize custom time inputs with current values when editing
    document.getElementById('addScheduleModal').addEventListener('show.bs.modal', function() {
        const originalTime = document.getElementById('scheduleOriginalTime').value;
        const keepOption = document.getElementById('keepExistingTime');
        
        // Show/hide "Keep existing time" option
        keepOption.parentElement.style.display = originalTime ? 'block' : 'none';
        
        if (originalTime) {
            // Split time range into start and end times
            const [startTime, endTime] = originalTime.split('-');
            document.getElementById('customStartTime').value = startTime;
            document.getElementById('customEndTime').value = endTime;
        }
    });
    
    // Initialize FullCalendar
    const calendarEl = document.getElementById('calendar');
    // Create a Map to store task counts by date
    const taskCountsByDate = new Map();

    // Function to get task count for a specific date
    function getDayTaskCount(date) {
        const dateStr = formatDate(date);
        return taskCountsByDate.get(dateStr) || 0;
    }

    // Function to update task counts
    function updateTaskCounts(events) {
        taskCountsByDate.clear();
        events.forEach(event => {
            if (!event.extendedProps?.isScheduled) {
                const dateStr = event.start.split('T')[0];
                taskCountsByDate.set(dateStr, (taskCountsByDate.get(dateStr) || 0) + 1);
            }
        });
    }

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        height: 'auto',
        headerToolbar: false,
        fixedWeekCount: false,
        dayHeaders: true,
        showNonCurrentDates: true,
        selectable: true,
        events: function(info, successCallback, failureCallback) {
            fetch(`/get_tasks_for_calendar?start=${formatDate(info.start)}&end=${formatDate(info.end)}`)
                .then(response => response.json())
                .then(events => {
                    const processedEvents = events.map(event => ({
                        ...event,
                        start: event.start,
                        display: 'background',
                        taskCount: event.extendedProps.taskCount
                    }));
                    successCallback(processedEvents);
                    
                    // Update task and schedule counts after events are loaded
                    setTimeout(() => {
                        document.querySelectorAll('.fc-daygrid-day').forEach(dayEl => {
                            // Remove any existing counts
                            const existingContainer = dayEl.querySelector('.count-container');
                            if (existingContainer) {
                                existingContainer.remove();
                            }
                            
                            const date = dayEl.getAttribute('data-date');
                            const event = processedEvents.find(e => e.start === date);
                            
                            if (event && (event.extendedProps.taskCount > 0 || event.extendedProps.scheduleCount > 0)) {
                                const countContainer = document.createElement('div');
                                countContainer.className = 'count-container';
                                
                                // Add task count if present
                                if (event.extendedProps.taskCount > 0) {
                                    const taskCountEl = document.createElement('div');
                                    taskCountEl.className = 'task-count';
                                    taskCountEl.textContent = `${event.extendedProps.taskCount}`;
                                    countContainer.appendChild(taskCountEl);
                                }
                                
                                // Add schedule count if present
                                if (event.extendedProps.scheduleCount > 0) {
                                    const scheduleCountEl = document.createElement('div');
                                    scheduleCountEl.className = 'schedule-count';
                                    scheduleCountEl.textContent = `${event.extendedProps.scheduleCount}`;
                                    // If we have completed schedule info, add it as a badge
                                    if (event.extendedProps.completedSchedule > 0) {
                                        const completedEl = document.createElement('div');
                                        completedEl.className = 'completed';
                                        completedEl.textContent = `${event.extendedProps.completedSchedule}`;
                                        scheduleCountEl.appendChild(completedEl);
                                    }
                                    countContainer.appendChild(scheduleCountEl);
                                }
                                
                                const dayNumberEl = dayEl.querySelector('.fc-daygrid-day-top');
                                if (dayNumberEl) {
                                    dayNumberEl.appendChild(countContainer);
                                }
                            }
                        });
                    }, 0);
                })
                .catch(error => failureCallback(error));
        },
        slotMinTime: '06:00:00',
        slotMaxTime: '24:00:00',
        allDaySlot: false,
        initialDate: new Date(),
        views: {
            dayGridMonth: {
                dayCellContent: function(arg) {
                    return {
                        html: `
                            <div class="fc-daygrid-day-top">
                                <div class="fc-daygrid-day-number">${arg.dayNumberText}</div>
                            </div>
                        `
                    };
                }
            }
        },
        dateClick: function(info) {
            // Create date in local timezone without time component
            const selectedDate = new Date(info.dateStr + 'T00:00:00');
            // Remove highlighting from previously selected date
            document.querySelectorAll('.fc-day-selected').forEach(el => {
                el.classList.remove('fc-day-selected');
            });
            // Add highlighting to clicked date
            info.dayEl.classList.add('fc-day-selected');
            
            currentDate = selectedDate;
            updateCurrentDate();
            updateDailySchedule();
            loadTasks(formatDate(currentDate));
            updateCalendarTitle();
        },
        eventDidMount: function(info) {
            // Handle recurring schedule events differently
            if (info.event.extendedProps.isScheduled) {
                info.el.classList.add('scheduled-event');
                if (info.event.extendedProps.type === 'class') {
                    info.el.classList.add('class-event');
                } else if (info.event.extendedProps.type === 'work') {
                    info.el.classList.add('work-event');
                }
            }
        },
        eventContent: function(arg) {
            // We'll handle the display through CSS and dayCellContent
            return { html: '' };
        },
        dayCellDidMount: function(arg) {
            const date = arg.date;
            const events = calendar.getEvents();
            const dateStr = formatDate(date);
            const event = events.find(e => formatDate(e.start) === dateStr);
            
            if (event) {
                const countContainer = document.createElement('div');
                countContainer.className = 'count-container';
                
                // Add task count if present
                if (event.extendedProps.taskCount > 0) {
                    const taskCountEl = document.createElement('div');
                    taskCountEl.className = 'task-count';
                    taskCountEl.textContent = `${event.extendedProps.taskCount}`;
                    countContainer.appendChild(taskCountEl);
                }
                
                // Add schedule count if present
                if (event.extendedProps.scheduleCount > 0) {
                    const scheduleCountEl = document.createElement('div');
                    scheduleCountEl.className = 'schedule-count';
                    scheduleCountEl.textContent = `${event.extendedProps.scheduleCount}`;
                    // If we have completed schedule info, add it as a badge
                    if (event.extendedProps.completedSchedule > 0) {
                        const completedEl = document.createElement('div');
                        completedEl.className = 'completed';
                        completedEl.textContent = `${event.extendedProps.completedSchedule}`;
                        scheduleCountEl.appendChild(completedEl);
                    }
                    countContainer.appendChild(scheduleCountEl);
                }
                
                if (event.extendedProps.taskCount > 0 || event.extendedProps.scheduleCount > 0) {
                    arg.el.querySelector('.fc-daygrid-day-top').appendChild(countContainer);
                }
            }
        }
    });
    calendar.render();

    // Handle calendar navigation and view changes
    document.getElementById('prevMonth').addEventListener('click', () => {
        calendar.prev();
        currentDate = calendar.getDate();
        updateCurrentDate();
        calendar.refetchEvents();
        loadTasks(formatDate(currentDate));
        updateCalendarTitle();
    });

    document.getElementById('nextMonth').addEventListener('click', () => {
        calendar.next();
        currentDate = calendar.getDate();
        updateCurrentDate();
        calendar.refetchEvents();
        loadTasks(formatDate(currentDate));
        updateCalendarTitle();
    });

    document.querySelectorAll('.calendar-view-options button').forEach(button => {
        button.addEventListener('click', (e) => {
            document.querySelectorAll('.calendar-view-options button').forEach(btn => 
                btn.classList.remove('active'));
            e.target.classList.add('active');
            const newView = e.target.dataset.view;
            currentViewType = newView; // Update the stored view type
            calendar.changeView(newView);
            
            // Update the date and refetch events
            currentDate = calendar.getDate();
            updateCurrentDate();
            calendar.refetchEvents();
            loadTasks(formatDate(currentDate));
            updateCalendarTitle();
            
            // Adjust calendar height based on view
            if (newView === 'timeGridWeek') {
                calendar.setOption('height', 600);
            } else {
                calendar.setOption('height', 'auto');
            }
        });
    });

    function updateCalendarTitle() {
        const date = calendar.getDate();
        const title = date.toLocaleString('default', { 
            month: 'long', 
            year: 'numeric' 
        });
        document.getElementById('calendarTitle').textContent = title;
    }
    updateCalendarTitle();
    const schedule = {
        'Monday': [
            {'time': '09:55-14:30', 'task': 'CS 544 - Big Data'},
            {'time': '09:55-14:30', 'task': 'STAT 611'},
            {'time': '09:55-14:30', 'task': 'STAT 613'}
        ],
        'Tuesday': [
            {'time': '12:30-17:00', 'task': 'Part-time Work'},
            {'time': 'Flexible', 'task': 'Startup Work (2 hours)'}
        ],
        'Wednesday': [
            {'time': '09:55-14:30', 'task': 'CS 544 - Big Data'},
            {'time': '09:55-14:30', 'task': 'STAT 611'},
            {'time': '09:55-14:30', 'task': 'STAT 613'}
        ],
        'Thursday': [
            {'time': '12:30-17:00', 'task': 'Part-time Work'},
            {'time': 'Flexible', 'task': 'Startup Work (2 hours)'}
        ],
        'Friday': [
            {'time': '09:55-10:55', 'task': 'CS 544 - Big Data'},
            {'time': '19:45-23:30', 'task': 'Part-time Work'},
            {'time': 'Flexible', 'task': 'Startup Work (2 hours)'}
        ],
        'Saturday': [
            {'time': 'Flexible', 'task': 'Startup Work (2 hours)'},
            {'time': 'Flexible', 'task': 'Weekly Project Work'}
        ],
        'Sunday': [
            {'time': 'Flexible', 'task': 'STAT 611 Assignment'},
            {'time': 'Flexible', 'task': 'Startup Work (2 hours)'},
            {'time': 'Flexible', 'task': 'Weekly Project Work'}
        ]
    };

    // Initialize current date without time component to avoid timezone issues
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    updateCurrentDate();
    loadTasks(formatDate(currentDate));
    updateDailySchedule();
    initializeStreakChart();

    // Event Listeners
    document.getElementById('saveTask').addEventListener('click', addTask);
    
    // Load initial weekly schedule
    loadWeeklySchedule();

    // Add schedule event listener
    document.getElementById('saveSchedule').addEventListener('click', () => {
        const hasOriginalValues = document.getElementById('scheduleOriginalDay').value !== '';
        if (hasOriginalValues) {
            editScheduleItem();
        } else {
            addScheduleItem();
        }
    });

    // Functions
    function updateCurrentDate() {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('currentDate').textContent = currentDate.toLocaleDateString('en-US', options);
    }

    function formatDate(date) {
        // Get year, month, and day in local timezone
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    async function updateDailySchedule() {
        const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
        const scheduleContainer = document.getElementById('dailySchedule');
        scheduleContainer.innerHTML = '';
        
        // Get completion status for the specific date
        const dateStr = formatDate(currentDate);
        const response = await fetch(`/get_schedule_status?date=${dateStr}`);
        const statusData = await response.json();
        
        // Create map of completed tasks with their state
        const completedTasks = new Map();
        
        // Add date heading
        const dateHeading = document.createElement('h4');
        dateHeading.className = 'schedule-date';
        dateHeading.textContent = currentDate.toLocaleDateString('en-US', { 
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });
        scheduleContainer.appendChild(dateHeading);

        const daySchedule = default_schedule[dayName] || [];
        if (daySchedule.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'schedule-empty';
            emptyMessage.textContent = 'No scheduled activities for today';
            scheduleContainer.appendChild(emptyMessage);
        } else {
            // Create timeline container
            const timelineContainer = document.createElement('div');
            timelineContainer.className = 'timeline-container';

            daySchedule.forEach((item, index) => {
                const scheduleItem = document.createElement('div');
                scheduleItem.className = 'schedule-item';

                // Find completion status from server response
                const taskStatus = statusData.tasks.find(t => 
                    t.time === item.time && t.task === item.task
                );
                const isCompleted = taskStatus ? taskStatus.completed : false;

                // Determine task type for styling
                let taskType = '';
                if (item.task.includes('CLASS')) taskType = 'class';
                else if (item.task.includes('WORK')) taskType = 'work';
                else if (item.task.includes('Study')) taskType = 'study';
                else if (item.task.includes('Startup Work')) taskType = 'startup';
                else if (item.task.includes('Sleep') || item.task.includes('Wake Up')) taskType = 'rest';
                else if (item.task.includes('Free Time') || item.task.includes('Break')) taskType = 'break';

                // Add timeline dot and line
                const timelineDot = document.createElement('div');
                timelineDot.className = `timeline-dot ${taskType} ${isCompleted ? 'completed' : ''}`;
                
                // Create time and task elements
                const timeEl = document.createElement('span');
                timeEl.className = `schedule-time ${taskType}`;
                timeEl.textContent = item.time;

                const taskEl = document.createElement('div');
                taskEl.className = 'schedule-task-container';
                
                // Create complete button
                const completeBtn = document.createElement('button');
                completeBtn.className = `btn btn-sm ${isCompleted ? 'btn-success' : 'btn-outline-secondary'} ms-2`;
                completeBtn.textContent = isCompleted ? 'Done' : 'Complete';
                completeBtn.onclick = async () => {
                    try {
                        const response = await fetch('/toggle_schedule_task', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                day: dayName,
                                time: item.time,
                                task: item.task,
                                date: formatDate(currentDate)
                            }),
                        });
                        const result = await response.json();
                        if (result.success) {
                            await updateDailySchedule();
                            // Update streak statistics and chart
                            await updateStreak();
                            await updateStreakChart();
                        }
                    } catch (error) {
                        console.error('Error toggling schedule task:', error);
                    }
                };

                taskEl.innerHTML = `
                    <div class="d-flex align-items-center justify-content-between w-100">
                        <span class="schedule-task ${taskType} ${isCompleted ? 'text-decoration-line-through' : ''}">${item.task}</span>
                    </div>
                    ${index < daySchedule.length - 1 ? '<div class="timeline-line"></div>' : ''}
                `;
                
                taskEl.querySelector('.d-flex').appendChild(completeBtn);

                scheduleItem.appendChild(timelineDot);
                scheduleItem.appendChild(timeEl);
                scheduleItem.appendChild(taskEl);
                timelineContainer.appendChild(scheduleItem);
            });

            scheduleContainer.appendChild(timelineContainer);
        }
    }

    async function loadTasks(dateStr) {
        try {
            const response = await fetch(`/get_tasks/${dateStr}`);
            const tasks = await response.json();
            displayTasks(tasks);
        } catch (error) {
            console.error('Error loading tasks:', error);
        }
    }

    function displayTasks(tasks) {
        const taskList = document.getElementById('taskList');
        taskList.innerHTML = '';

        tasks.forEach(task => {
            const taskElement = document.createElement('div');
            taskElement.className = `task-item d-flex align-items-center ${task.is_completed ? 'completed' : ''} priority-${task.priority}`;
            
            const taskCheckbox = document.createElement('input');
            taskCheckbox.type = 'checkbox';
            taskCheckbox.className = 'task-checkbox form-check-input';
            taskCheckbox.checked = task.is_completed;
            taskCheckbox.dataset.id = task.id;
            
            const titleSpan = document.createElement('span');
            titleSpan.className = 'task-title flex-grow-1';
            titleSpan.textContent = task.title;
            
            const categorySpan = document.createElement('span');
            categorySpan.className = `task-category category-${task.category}`;
            categorySpan.textContent = task.category;
            
            const streakSpan = document.createElement('span');
            if (task.streak_count > 0) {
                streakSpan.className = 'task-streak';
                streakSpan.textContent = `${task.streak_count} day streak! 🔥`;
            }
            
            const timeSpan = document.createElement('span');
            timeSpan.className = 'task-time ms-2';
            timeSpan.textContent = task.time_slot || '';
            
            const editButton = document.createElement('button');
            editButton.className = 'btn btn-link btn-sm edit-task-btn ms-2';
            editButton.innerHTML = '<i class="fas fa-edit"></i>';
            editButton.onclick = () => editTask(task.id);
            
            taskElement.appendChild(taskCheckbox);
            taskElement.appendChild(titleSpan);
            taskElement.appendChild(categorySpan);
            if (task.streak_count > 0) taskElement.appendChild(streakSpan);
            if (task.time_slot) taskElement.appendChild(timeSpan);
            taskElement.appendChild(editButton);
            
            taskList.appendChild(taskElement);

            // Add event listener to checkbox
            const checkbox = taskElement.querySelector('.task-checkbox');
            checkbox.addEventListener('change', () => toggleTask(task.id));
        });
    }

    async function addTask() {
        const taskId = document.getElementById('taskId').value;
        const title = document.getElementById('taskTitle').value;
        const date = document.getElementById('taskDate').value;
        const category = document.getElementById('taskCategory').value;
        const priority = document.getElementById('taskPriority').value;
        const timeSlot = document.getElementById('taskTimeSlot').value;

        if (!title || !date) return;

        const data = {
            title,
            date,
            category,
            priority,
            time_slot: timeSlot
        };

        try {
            const url = taskId ? `/edit_task/${taskId}` : '/add_task';
            const method = taskId ? 'PUT' : 'POST';
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            if (response.ok) {
                // Get the original date if this was an edit
                const originalDate = taskId ? document.getElementById('taskId').dataset.originalDate : null;
                
                // If the date was changed or this is a new task, refresh the calendar
                if (!taskId || date !== originalDate) {
                    calendar.refetchEvents();
                }
                
                // Refresh tasks for current view if we're on the relevant date
                if (formatDate(currentDate) === date || (taskId && formatDate(currentDate) === originalDate)) {
                    loadTasks(formatDate(currentDate));
                }
                
                // Reset form and close modal
                document.getElementById('addTaskForm').reset();
                document.getElementById('taskId').dataset.originalDate = '';
                bootstrap.Modal.getInstance(document.getElementById('addTaskModal')).hide();
            }
        } catch (error) {
            console.error('Error adding task:', error);
        }
    }

    async function toggleTask(taskId) {
        try {
            const response = await fetch('/toggle_task', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id: taskId }),
            });

            if (response.ok) {
                await updateStreak();
                await loadTasks(formatDate(currentDate));
                await updateStreakChart();
            }
        } catch (error) {
            console.error('Error toggling task:', error);
        }
    }

    async function updateStreak() {
        try {
            await fetch('/update_streak', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
        } catch (error) {
            console.error('Error updating streak:', error);
        }
    }

    async function editTask(taskId) {
        try {
            const response = await fetch(`/get_tasks/${formatDate(currentDate)}`);
            const tasks = await response.json();
            const task = tasks.find(t => t.id === taskId);
            
            if (task) {
                document.getElementById('taskId').value = task.id;
                document.getElementById('taskTitle').value = task.title;
                document.getElementById('taskDate').value = formatDate(currentDate);
                document.getElementById('taskCategory').value = task.category;
                document.getElementById('taskPriority').value = task.priority;
                document.getElementById('taskTimeSlot').value = task.time_slot || '';
                
                // Store original date for comparison
                document.getElementById('taskId').dataset.originalDate = formatDate(currentDate);
                
                const modal = new bootstrap.Modal(document.getElementById('addTaskModal'));
                modal.show();
            }
        } catch (error) {
            console.error('Error editing task:', error);
        }
    }

    let streakChart = null;

    async function updateStreakChart() {
        try {
            const response = await fetch('/get_streak_data');
            const streakData = await response.json();
            
            const labels = streakData.map(d => d.day);
            const data = streakData.map(d => d.completion_rate);
            
            if (streakChart) {
                streakChart.data.labels = labels;
                streakChart.data.datasets[0].data = data;
                streakChart.update();
            } else {
                const ctx = document.createElement('canvas');
                document.getElementById('streakChart').appendChild(ctx);

                streakChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Task Completion Rate',
                            data: data,
                            borderColor: '#4CAF50',
                            backgroundColor: 'rgba(76, 175, 80, 0.1)',
                            tension: 0.1,
                            fill: true
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: 100,
                                ticks: {
                                    callback: function(value) {
                                        return value + '%';
                                    }
                                }
                            }
                        },
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const dataPoint = streakData[context.dataIndex];
                                        return `Completed ${dataPoint.completed} of ${dataPoint.total} tasks (${dataPoint.completion_rate}%)`;
                                    }
                                }
                            }
                        },
                        animation: {
                            duration: 500
                        }
                    }
                });
            }
        } catch (error) {
            console.error('Error updating streak chart:', error);
        }
    }

    async function initializeStreakChart() {
        await updateStreakChart();
    }
});