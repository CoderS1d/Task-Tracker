from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, date, timedelta
import json
import os
from schedule import default_schedule

# Create the Flask application
app = Flask(__name__)

# Database configuration
basedir = os.path.abspath(os.path.dirname(__file__))

# Configure the database connection
if os.environ.get('RAILWAY_ENVIRONMENT'):
    # Use PostgreSQL on Railway
    app.config['SQLALCHEMY_DATABASE_URI'] = "postgresql://postgres:NeuNLCSePwKdMkPjoMebgghcvSgsfyvJ@shortline.proxy.rlwy.net:32610/railway"
    print("Using Railway PostgreSQL database")
else:
    # Use SQLite locally
    db_path = os.path.join(basedir, 'tasks.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
    print("Using local SQLite database")

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize SQLAlchemy
db = SQLAlchemy(app)

# Ensure all tables are created
with app.app_context():
    try:
        # Create all tables
        db.create_all()
        
        # Verify the tables were created
        inspector = db.inspect(db.engine)
        tables = inspector.get_table_names()
        print(f"Available tables: {', '.join(tables)}")
        
    except Exception as e:
        print(f"Database initialization error: {str(e)}")
        raise

# Database Models
class Task(db.Model):
    __tablename__ = 'task_table'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    is_completed = db.Column(db.Boolean, default=False)
    date = db.Column(db.Date, nullable=False)
    category = db.Column(db.String(50))
    priority = db.Column(db.String(20), default='Medium')  # High, Medium, Low
    streak_count = db.Column(db.Integer, default=0)
    last_completed = db.Column(db.Date)
    time_slot = db.Column(db.String(50))
    
class TaskStreak(db.Model):
    __tablename__ = 'task_streak_table'
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('task_table.id'))
    date = db.Column(db.Date, nullable=False)
    completed = db.Column(db.Boolean, default=False)
    
    __table_args__ = (
        db.Index('idx_task_streak_date', 'date'),
    )
    
class Streak(db.Model):
    __tablename__ = 'streak_table'
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    completed_tasks = db.Column(db.Integer, default=0)
    total_tasks = db.Column(db.Integer, default=0)

class ScheduleTask(db.Model):
    __tablename__ = 'schedule_task_table'
    id = db.Column(db.Integer, primary_key=True)
    day = db.Column(db.String(20), nullable=False)  # Monday, Tuesday, etc.
    time = db.Column(db.String(50), nullable=False)  # time slot like "06:00-07:00"
    task = db.Column(db.String(200), nullable=False)
    completed = db.Column(db.Boolean, default=False)
    date = db.Column(db.Date, nullable=False)  # The actual date of completion
    
    __table_args__ = (
        db.Index('idx_schedule_task_date', 'date'),
        db.Index('idx_schedule_task_lookup', 'day', 'time', 'task'),
    )
    
    # Add index for faster querying
    __table_args__ = (
        db.Index('idx_schedule_task_date', 'date'),
        db.Index('idx_schedule_task_lookup', 'day', 'time', 'task'),
    )

@app.route('/')
def index():
    try:
        today = date.today()
        # Query tasks for today using the correct table name
        tasks = db.session.query(Task).filter(Task.date == today).all()
        # Query streaks using the correct table name
        streaks = db.session.query(Streak).order_by(Streak.date.desc()).all()
        
        return render_template('index.html', tasks=tasks, streaks=streaks, schedule=default_schedule)
    except Exception as e:
        print(f"Error in index route: {str(e)}")
        import traceback
        traceback.print_exc()
        # Return an empty result rather than failing
        return render_template('index.html', tasks=[], streaks=[], schedule=default_schedule)

@app.route('/add_task', methods=['POST'])
def add_task():
    data = request.json
    # Parse the date in local timezone
    task_date = datetime.strptime(data['date'], '%Y-%m-%d').date()
    new_task = Task(
        title=data['title'],
        date=task_date,
        category=data.get('category', 'General'),
        priority=data.get('priority', 'Medium'),
        time_slot=data.get('time_slot')
    )
    db.session.add(new_task)
    db.session.commit()
    return jsonify({'success': True, 'id': new_task.id})

@app.route('/edit_task/<int:task_id>', methods=['PUT'])
def edit_task(task_id):
    data = request.json
    task = Task.query.get_or_404(task_id)
    task.title = data.get('title', task.title)
    task.category = data.get('category', task.category)
    task.priority = data.get('priority', task.priority)
    task.time_slot = data.get('time_slot', task.time_slot)
    if 'date' in data:
        task.date = datetime.strptime(data['date'], '%Y-%m-%d').date()
    db.session.commit()
    return jsonify({'success': True})

@app.route('/toggle_task', methods=['POST'])
def toggle_task():
    data = request.json
    task = Task.query.get(data['id'])
    if task:
        today = date.today()
        task.is_completed = not task.is_completed
        
        if task.is_completed:
            if task.last_completed:
                # Check if the last completion was yesterday
                if (today - task.last_completed).days == 1:
                    task.streak_count += 1
                elif (today - task.last_completed).days > 1:
                    task.streak_count = 1
            else:
                task.streak_count = 1
            task.last_completed = today
            
            # Record streak
            streak_record = TaskStreak(task_id=task.id, date=today, completed=True)
            db.session.add(streak_record)
        else:
            # If unchecking today's completion
            if task.last_completed == today:
                task.streak_count = max(0, task.streak_count - 1)
                task.last_completed = None
                
                # Update streak record
                streak_record = TaskStreak.query.filter_by(
                    task_id=task.id, date=today
                ).first()
                if streak_record:
                    streak_record.completed = False
        
        db.session.commit()
        return jsonify({
            'success': True,
            'streak_count': task.streak_count
        })
    return jsonify({'success': False})

@app.route('/get_streak_data')
def get_streak_data():
    # Get last 7 days of streak data
    today = date.today()
    streak_data = []
    
    for i in range(6, -1, -1):
        date_to_check = today - timedelta(days=i)
        day_name = date_to_check.strftime('%A')
        
        # Get total scheduled tasks for this day
        total_schedule_tasks = get_daily_schedule_task_count(day_name)
        
        # Get completed tasks for this date
        streak = Streak.query.filter_by(date=date_to_check).first()
        completed_tasks = streak.completed_tasks if streak else 0
        
        # Calculate completion rate
        completion_rate = (completed_tasks / total_schedule_tasks * 100) if total_schedule_tasks > 0 else 0
        
        streak_data.append({
            'date': date_to_check.strftime('%Y-%m-%d'),
            'completion_rate': round(completion_rate, 1),
            'day': date_to_check.strftime('%a'),
            'completed': completed_tasks,
            'total': total_schedule_tasks
        })
    
    return jsonify(streak_data)

def get_daily_schedule_task_count(day_name):
    from schedule import default_schedule
    return len(default_schedule.get(day_name, []))

@app.route('/update_streak', methods=['POST'])
def update_streak():
    today = date.today()
    day_name = today.strftime('%A')  # Get current day name
    
    # Get total scheduled tasks for today from the default schedule
    total_schedule_tasks = get_daily_schedule_task_count(day_name)
    
    # Get completed schedule tasks
    schedule_tasks = ScheduleTask.query.filter_by(date=today).all()
    completed_schedule_tasks = sum(1 for task in schedule_tasks if task.completed)
    
    # Calculate completion rate only for schedule tasks
    completion_rate = (completed_schedule_tasks / total_schedule_tasks * 100) if total_schedule_tasks > 0 else 0
    
    streak = Streak.query.filter_by(date=today).first()
    if not streak:
        streak = Streak(date=today, completed_tasks=completed_schedule_tasks, total_tasks=total_schedule_tasks)
        db.session.add(streak)
    else:
        streak.completed_tasks = completed_schedule_tasks
        streak.total_tasks = total_schedule_tasks
    
    db.session.commit()
    
    # Return updated streak data
    return jsonify({
        'success': True,
        'completionRate': round(completion_rate, 1),
        'completed': completed_schedule_tasks,
        'total': total_schedule_tasks
    })

@app.route('/toggle_schedule_task', methods=['POST'])
def toggle_schedule_task():
    data = request.json
    
    # Parse the date from the request, default to today
    task_date = datetime.strptime(data.get('date', date.today().strftime('%Y-%m-%d')), '%Y-%m-%d').date()
    
    # Find or create schedule task for the specific date
    schedule_task = ScheduleTask.query.filter_by(
        day=data['day'],
        time=data['time'],
        task=data['task'],
        date=task_date
    ).first()
    
    if not schedule_task:
        # Create new task for this specific date
        schedule_task = ScheduleTask(
            day=data['day'],
            time=data['time'],
            task=data['task'],
            date=task_date,
            completed=True
        )
        db.session.add(schedule_task)
    else:
        # Toggle existing task for this specific date
        schedule_task.completed = not schedule_task.completed
    
    db.session.commit()
    
    # Update streak for this specific date
    if task_date == date.today():
        update_streak()
    
    return jsonify({
        'success': True,
        'completed': schedule_task.completed,
        'date': task_date.strftime('%Y-%m-%d')
    })

@app.route('/get_schedule_status', methods=['GET'])
def get_schedule_status():
    # Get the date from query parameters, default to today
    date_str = request.args.get('date')
    if date_str:
        try:
            current_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            current_date = date.today()
    else:
        current_date = date.today()
    
    day_name = current_date.strftime('%A')
    
    # Get tasks for the specific date only
    tasks = ScheduleTask.query.filter_by(date=current_date).all()
    completed_tasks = {(task.time, task.task): task.completed for task in tasks}
    
    # Get default schedule for the day
    from schedule import default_schedule
    day_schedule = default_schedule.get(day_name, [])
    
    return jsonify({
        'tasks': [{
            'day': day_name,
            'time': item['time'],
            'task': item['task'],
            'completed': completed_tasks.get((item['time'], item['task']), False),
            'date': current_date.strftime('%Y-%m-%d')
        } for item in day_schedule]
    })

@app.route('/get_tasks/<date_str>')
def get_tasks(date_str):
    try:
        # Parse the date string in local timezone
        query_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        # Ensure we're using the date as-is without timezone conversion
        tasks = Task.query.filter_by(date=query_date).all()
        return jsonify([{
            'id': task.id,
            'title': task.title,
            'is_completed': task.is_completed,
            'category': task.category,
            'priority': task.priority,
            'streak_count': task.streak_count,
            'time_slot': task.time_slot
        } for task in tasks])
    except Exception as e:
        return jsonify({'error': str(e)}), 400

def get_schedule_count_for_day(day_name):
    from schedule import default_schedule
    return len(default_schedule.get(day_name, []))

@app.route('/get_tasks_for_calendar')
def get_tasks_for_calendar():
    start = request.args.get('start')
    end = request.args.get('end')
    events = []
    
    try:
        start_date = datetime.strptime(start, '%Y-%m-%d').date() if start else date.today()
        end_date = datetime.strptime(end, '%Y-%m-%d').date() if end else None
        
        # Get tasks grouped by date
        tasks = Task.query.all()
        task_counts = {}
        schedule_counts = {}
        completed_schedule_counts = {}
        
        # Count tasks per date
        for task in tasks:
            date_str = task.date.strftime('%Y-%m-%d')
            if date_str not in task_counts:
                task_counts[date_str] = 0
            task_counts[date_str] += 1
        
        # Get schedule counts and completions for each date
        current_date = start_date
        while current_date <= end_date:
            date_str = current_date.strftime('%Y-%m-%d')
            day_name = current_date.strftime('%A')
            
            # Get total schedule items for this day
            schedule_count = get_schedule_count_for_day(day_name)
            schedule_counts[date_str] = schedule_count
            
            # Get completed schedule items
            completed_count = ScheduleTask.query.filter_by(
                date=current_date,
                completed=True
            ).count()
            completed_schedule_counts[date_str] = completed_count
            
            current_date += timedelta(days=1)
        
        # Create events for each day with both counts
        for date_str in schedule_counts.keys():
            task_count = task_counts.get(date_str, 0)
            schedule_count = schedule_counts.get(date_str, 0)
            completed_schedule = completed_schedule_counts.get(date_str, 0)
            
            event = {
                'start': date_str,
                'allDay': True,
                'display': 'background',
                'extendedProps': {
                    'taskCount': task_count,
                    'scheduleCount': schedule_count,
                    'completedSchedule': completed_schedule,
                    'isScheduled': False
                }
            }
            events.append(event)
        
        # Add scheduled events (class schedule)
        class_schedule = [
            # Monday/Wednesday classes
            {'days': [1, 3], 'start': '09:55', 'end': '14:30', 'title': 'Class'},
            # Friday class
            {'days': [5], 'start': '09:55', 'end': '10:55', 'title': 'Class'}
        ]
        for schedule in class_schedule:
            events.append({
                'title': schedule['title'],
                'startTime': schedule['start'],
                'endTime': schedule['end'],
                'daysOfWeek': schedule['days'],
                'backgroundColor': '#4CAF50',
                'borderColor': '#388E3C',
                'extendedProps': {
                    'isScheduled': True,
                    'type': 'class'
                }
            })
        
        # Add work schedule
        work_schedule = [
            # Tuesday/Thursday work
            {'days': [2, 4], 'start': '12:30', 'end': '17:00', 'title': 'Work'},
            # Friday evening work
            {'days': [5], 'start': '19:45', 'end': '23:30', 'title': 'Work'}
        ]
        for schedule in work_schedule:
            events.append({
                'title': schedule['title'],
                'startTime': schedule['start'],
                'endTime': schedule['end'],
                'daysOfWeek': schedule['days'],
                'backgroundColor': '#2196F3',
                'borderColor': '#1976D2',
                'extendedProps': {
                    'isScheduled': True,
                    'type': 'work'
                }
            })
        
        return jsonify(events)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/manage_schedule', methods=['POST'])
def manage_schedule():
    try:
        data = request.json
        action = data.get('action')
        schedule_path = os.path.join(basedir, 'schedule.py')
        
        if action == 'add':
            # Add new schedule item
            new_schedule = {
                'day': data['day'],
                'time': data['time'],
                'task': data['task']
            }
            
            # Update schedule in the module
            if data['day'] not in default_schedule:
                default_schedule[data['day']] = []
            default_schedule[data['day']].append(new_schedule)
            
            # Save updated schedule to file
            with open(schedule_path, 'w') as f:
                f.write("default_schedule = " + json.dumps(default_schedule, indent=4))
            
            return jsonify({'success': True, 'message': 'Schedule added successfully'})
            
        elif action == 'edit':
            # Get original item details
            original_day = data['originalDay']
            original_time = data['originalTime']
            original_task = data['originalTask']
            
            # Remove original item
            if original_day in default_schedule:
                default_schedule[original_day] = [
                    item for item in default_schedule[original_day]
                    if not (item['time'] == original_time and item['task'] == original_task)
                ]
            
            # Add updated item
            new_day = data['day']
            if new_day not in default_schedule:
                default_schedule[new_day] = []
                
            default_schedule[new_day].append({
                'day': new_day,
                'time': data['time'],
                'task': data['task']
            })
            
            # Save updated schedule
            with open(schedule_path, 'w') as f:
                f.write("default_schedule = " + json.dumps(default_schedule, indent=4))
            
            return jsonify({'success': True, 'message': 'Schedule updated successfully'})
            
        elif action == 'delete':
            # Remove schedule item
            day = data['day']
            time = data['time']
            task = data['task']
            
            if day in default_schedule:
                default_schedule[day] = [
                    item for item in default_schedule[day]
                    if not (item['time'] == time and item['task'] == task)
                ]
                
                # Save updated schedule
                with open(schedule_path, 'w') as f:
                    f.write("default_schedule = " + json.dumps(default_schedule, indent=4))
                
                return jsonify({'success': True, 'message': 'Schedule removed successfully'})
        
        return jsonify({'success': False, 'message': 'Invalid action'})
        
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 400

@app.route('/get_schedule', methods=['GET'])
def get_schedule():
    return jsonify(default_schedule)

def safe_migrate_db():
    """Safely migrate the database schema without losing data."""
    with app.app_context():
        try:
            # Get all existing tables
            inspector = db.inspect(db.engine)
            existing_tables = inspector.get_table_names()
            
            # Create any missing tables
            db.create_all()
            
            # Verify all tables were created
            inspector = db.inspect(db.engine)
            current_tables = inspector.get_table_names()
            expected_tables = ['task_table', 'task_streak_table', 'streak_table', 'schedule_task_table']
            missing_tables = [t for t in expected_tables if t not in current_tables]
            
            if missing_tables:
                print(f"Warning: Missing tables after migration: {', '.join(missing_tables)}")
            else:
                print("All expected tables are present")
            
            print(f"Database ready with tables: {', '.join(current_tables)}")
            if not existing_tables:
                print("New database initialized successfully!")
            else:
                print(f"Existing database migrated with {len(current_tables)} tables!")
                
        except Exception as e:
            print(f"Error during database migration: {str(e)}")
            raise

if __name__ == '__main__':
    app.run(debug=True)