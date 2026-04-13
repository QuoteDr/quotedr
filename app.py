#!/usr/bin/env python3
"""
ALD Direct Inc. - Web-Based Invoicing System v1.0
Owner: Adam
Purpose: Professional renovation invoicing with your authentic voice
"""

from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import date, datetime, timedelta
import os
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['SECRET_KEY'] = 'ald-direct-secret-key-2026'  # Change in production!
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///ald_invoices.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = '/home/node/.openclaw/workspace/files to look at'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

db = SQLAlchemy(app)

# ============================================================================
# DATABASE MODELS
# ============================================================================

class Client(db.Model):
    __tablename__ = 'clients'
    
    id = db.Column(db.Integer, primary_key=True)
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(200))
    phone = db.Column(db.String(50))
    address = db.Column(db.Text)
    city = db.Column(db.String(100))
    province = db.Column(db.String(50))
    postal_code = db.Column(db.String(20))
    notes = db.Column(db.Text)  # e.g., "James and Victoria - basement job 2024"
    referral_source = db.Column(db.String(200))
    total_spent = db.Column(db.Float, default=0.0)
    last_project_date = db.Column(db.Date)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    projects = db.relationship('Project', backref='client', lazy=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'email': self.email,
            'phone': self.phone,
            'address': self.address,
            'city': self.city,
            'province': self.province,
            'postal_code': self.postal_code,
            'notes': self.notes or '',
            'referral_source': self.referral_source or '',
            'total_spent': self.total_spent,
            'last_project_date': self.last_project_date.isoformat() if self.last_project_date else None,
        }

class Project(db.Model):
    __tablename__ = 'projects'
    
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.Integer, db.ForeignKey('clients.id'), nullable=False)
    project_name = db.Column(db.String(200), nullable=False)
    status = db.Column(db.String(50), default='Quote')  # Quote, Accepted, In Progress, Complete, On Hold
    quote_date = db.Column(db.Date)
    start_date = db.Column(db.Date)
    estimated_end_date = db.Column(db.Date)
    actual_end_date = db.Column(db.Date)
    total_quote_amount = db.Column(db.Float)
    total_invoiced = db.Column(db.Float, default=0.0)
    balance_due = db.Column(db.Float, default=0.0)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    invoice_lines = db.relationship('InvoiceLine', backref='project', lazy=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'client_id': self.client_id,
            'project_name': self.project_name,
            'status': self.status,
            'quote_date': self.quote_date.isoformat() if self.quote_date else None,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'estimated_end_date': self.estimated_end_date.isoformat() if self.estimated_end_date else None,
            'actual_end_date': self.actual_end_date.isoformat() if self.actual_end_date else None,
            'total_quote_amount': self.total_quote_amount,
            'total_invoiced': self.total_invoiced,
            'balance_due': self.balance_due,
            'notes': self.notes or '',
        }

class RoomBreak(db.Model):
    """Room/Area breaks for organizing quotes by space (basement, kitchen, bathroom, etc.)"""
    __tablename__ = 'room_breaks'
    
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    room_name = db.Column(db.String(100), nullable=False)  # e.g., "Basement", "Kitchen"
    order = db.Column(db.Integer, default=0)  # Display order
    notes = db.Column(db.Text)  # Optional description for this room
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    invoice_lines = db.relationship('InvoiceLine', backref='room_break', lazy=True)

class InvoiceLine(db.Model):
    __tablename__ = 'invoice_lines'
    
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    room_break_id = db.Column(db.Integer, db.ForeignKey('room_breaks.id'), nullable=True)  # Which room this line belongs to
    category = db.Column(db.String(100), nullable=False)  # Framing, Electrical, etc.
    service_name = db.Column(db.String(200), nullable=False)
    unit_type = db.Column(db.String(50))  # LF, sq ft, each, hourly
    description = db.Column(db.Text, nullable=False)  # What was done
    quantity = db.Column(db.Float, default=1.0)
    unit_rate = db.Column(db.Float, nullable=False)
    line_total = db.Column(db.Float, nullable=False)
    notes = db.Column(db.Text)
    
    def to_dict(self):
        return {
            'id': self.id,
            'project_id': self.project_id,
            'category': self.category,
            'service_name': self.service_name,
            'unit_type': self.unit_type,
            'description': self.description,
            'quantity': self.quantity,
            'unit_rate': self.unit_rate,
            'line_total': self.line_total,
            'notes': self.notes or '',
        }

class PricingRate(db.Model):
    """Reference table for standard pricing rates."""
    __tablename__ = 'pricing_rates'
    
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(100), nullable=False)
    service_name = db.Column(db.String(200), nullable=False)
    unit_type = db.Column(db.String(50))  # LF, sq ft, each, hourly
    material_cost = db.Column(db.Float, default=0.0)
    labor_cost = db.Column(db.Float, default=0.0)
    total_rate = db.Column(db.Float, nullable=False)
    notes = db.Column(db.Text)
    is_active = db.Column(db.Boolean, default=True)

# Add Room Breaks to existing projects (for backward compatibility)
def add_room_breaks_to_existing_projects():
    """Add a default 'General' room break to all existing projects."""
    existing_projects = Project.query.all()
    for project in existing_projects:
        if not any(RoomBreak.query.filter_by(project_id=project.id).all()):
            # Create a default room break
            default_break = RoomBreak(
                project_id=project.id,
                room_name='General',
                order=0
            )
            db.session.add(default_break)
    db.session.commit()
    print(f"Added 'General' room breaks to {len(existing_projects)} existing projects.")
    
    def to_dict(self):
        return {
            'id': self.id,
            'category': self.category,
            'service_name': self.service_name,
            'unit_type': self.unit_type,
            'material_cost': self.material_cost,
            'labor_cost': self.labor_cost,
            'total_rate': self.total_rate,
            'notes': self.notes or '',
        }

# ============================================================================
# PRICING DATABASE INITIALIZATION
# ============================================================================

def init_databases():
    """Initialize all databases including room breaks for existing projects."""
    # Create tables first (including new RoomBreak table)
    db.create_all()
    
    # First, add room breaks to existing projects
    add_room_breaks_to_existing_projects()
    
    # Then initialize pricing rates
    pricing_data = [
        # FRAMING
        ("Framing", "2x4 Wall Framing", "LF", 10.00, 4.58, 14.60, "10' wall ~$100, can build in hour easy"),
        ("Framing", "2x6 Wall Framing", "LF", 10.00, 7.35, 17.35, ""),
        ("Framing", "Basement Walls", "LF", 0.00, 0.00, 20.00, "Basement-specific pricing"),
        ("Framing", "LVL Beam (9½\" Tamarack)", "LF", 7.49, 0.00, 7.49, "Material only, before tax"),
        
        # SUBFLOOR
        ("Subfloor", "½\" OSB Sheet", "each", 2.15, 0.00, 2.15, ""),
        ("Subfloor", "⅝\" OSB Sheet", "each", 2.50, 0.00, 2.50, ""),
        ("Subfloor", "¾\" OSB Sheet", "each", 2.75, 0.00, 2.75, ""),
        
        # ELECTRICAL
        ("Electrical", "Standard Electrical Work", "hourly", 0.00, 100.00, 100.00, "Labor only, materials extra"),
        ("Electrical", "Wire (bulk 150m)", "meter", 1.92, 0.00, 1.92, "Bulk pricing"),
        ("Electrical", "Device Box", "each", 2.00, 0.00, 2.00, "In bulk"),
        ("Electrical", "Decorative Receptacle (per unit)", "each", 0.40, 0.00, 0.40, "10 pack pricing"),
        ("Electrical", "Recessed Tilt Light", "each", 80.00, 0.00, 80.00, ""),
        ("Electrical", "Regular Recessed Pot", "each", 30.00, 0.00, 30.00, ""),
        ("Electrical", "Under Cabinet Lighting", "each", 200.00, 100.00, 300.00, "Base + $100/extra location"),
        ("Electrical", "Add Receptacle 15A (existing circuit)", "each", 0.00, 70.00, 70.00, ""),
        ("Electrical", "Add GFCI 15A (existing circuit)", "each", 25.00, 95.00, 120.00, "$70 labor + $25 material"),
        ("Electrical", "Install Ceiling Fan & Mount", "each", 0.00, 150.00, 150.00, ""),
        ("Electrical", "Extractor Fan + Roof Vent (<80 sq ft)", "each", 0.00, 450.00, 450.00, ""),
        ("Electrical", "Extractor Fan + Roof Vent (<100 sq ft)", "each", 0.00, 520.00, 520.00, ""),
        ("Electrical", "Extractor Fan + Roof Vent (<140 sq ft)", "each", 0.00, 605.00, 605.00, ""),
        ("Electrical", "Ceiling Fan Replace (install only)", "each", 0.00, 125.00, 125.00, "Average of $100-$150"),
        ("Electrical", "Chandelier Install", "each", 0.00, 150.00, 150.00, "Average of $100-$200"),
        ("Electrical", "TV Mount (wall mounting)", "each", 0.00, 175.00, 175.00, ""),
        ("Electrical", "Doorbell Camera Install", "each", 0.00, 200.00, 200.00, ""),
        
        # PLUMBING
        ("Plumbing", "Standard Plumbing Work", "hourly", 0.00, 100.00, 100.00, "Labor only, materials extra"),
        ("Plumbing", "Solder Shut-off", "each", 0.00, 150.00, 150.00, ""),
        ("Plumbing", "PEX Shut-off", "each", 0.00, 125.00, 125.00, ""),
        ("Plumbing", "Toilet Replacement", "each", 0.00, 250.00, 250.00, ""),
        ("Plumbing", "Shower Rough-in", "each", 0.00, 1300.00, 1300.00, "Premium service rate"),
        ("Plumbing", "Toilet Install Only", "each", 0.00, 200.00, 200.00, ""),
        ("Plumbing", "Tub Installation", "each", 0.00, 600.00, 600.00, ""),
        ("Plumbing", "Toilet Rough-in", "each", 0.00, 300.00, 300.00, "+ base cost"),
        ("Plumbing", "Vanity Rough-in", "each", 0.00, 200.00, 200.00, ""),
        ("Plumbing", "Laundry Sink Installation", "each", 0.00, 400.00, 400.00, ""),
        ("Plumbing", "Kitchen Sink Cutout + Mount + Fixtures", "each", 0.00, 400.00, 400.00, ""),
        ("Plumbing", "No Sink Cutout Required", "each", 0.00, 350.00, 350.00, ""),
        ("Plumbing", "Dishwasher Replacement", "each", 0.00, 300.00, 300.00, "Plumb, level, anchor, wire"),
        ("Plumbing", "New Dishwasher Install", "each", 0.00, 400.00, 400.00, ""),
        ("Plumbing", "Sink Faucet Installation", "each", 0.00, 200.00, 200.00, ""),
        ("Plumbing", "Sink Replacement + Disposal (laundry)", "each", 0.00, 475.00, 475.00, "Average of $450-$500"),
        ("Plumbing", "Anti-Siphon Hose Bib", "each", 0.00, 250.00, 250.00, "Average of $200-$300"),
        ("Plumbing", "Vanity Install (Adam's rate)", "each", 0.00, 400.00, 400.00, "Average of $350-$450"),
        ("Plumbing", "Pedestal Sink Install (with new shut-offs)", "each", 0.00, 400.00, 400.00, ""),
        
        # HVAC & VENTILATION
        ("HVAC", "Heat Run (6\" supply)", "LF", 20.00, 0.00, 20.00, "Labor + material, NO GRILLS"),
        ("HVAC", "Flat Minimum for Short Runs", "each", 75.00, 0.00, 75.00, ""),
        ("HVAC", "4x10 Floor Vent Upgrade (ARIA/Fittes)", "each", 200.00, 0.00, 200.00, "Better airflow"),
        ("HVAC", "Floor Vent Framed with Louvers (M+L)", "each", 70.00, 120.00, 190.00, ""),
        ("HVAC", "Floor Vent Framed TILE (M+L)", "each", 85.00, 175.00, 260.00, ""),
        ("HVAC", "Floor Vent Frameless (M+L)", "each", 85.00, 160.00, 245.00, ""),
        ("HVAC", "Floor Vent Frameless TILE (ML only)", "each", 0.00, 200.00, 200.00, ""),
        ("HVAC", "Drywall Vent C.A.R. Large (M+L)", "each", 75.00, 215.00, 290.00, ""),
        
        # INSULATION & SOUNDPROOFING
        ("Insulation", "Batts Install Labor Only", "sq ft", 0.00, 1.00, 1.00, "Materials extra"),
        ("Insulation", "Vapor Barrier Install (L+M)", "sq ft", 0.00, 1.00, 1.00, ""),
        ("Insulation", "R14 Insulation (2x4 studs) M+L", "sq ft", 0.00, 2.00, 2.00, "$3 with vapor"),
        ("Insulation", "R22 Insulation M+L", "sq ft", 0.00, 2.70, 2.70, "$3.70 with vapor"),
        ("Insulation", "EPS Foam Panels (1.5\") Material Only", "sq ft", 1.35, 0.00, 1.35, ""),
        ("Insulation", "Blown-in Cellulose Attic (first 1000 ft³)", "ft³", 2.65, 0.00, 2.65, "Additional @ $2.00/ft³"),
        ("Insulation", "SonoPAN Ceiling Material Only", "sq ft", 1.05, 0.00, 1.05, ""),
        ("Insulation", "Safe and Sound (2x6) M+L", "sq ft", 0.00, 3.00, 3.00, "Marketing ploy - minimal sound difference"),
        ("Insulation", "Resilient Channel Material Only", "sq ft", 1.00, 0.00, 1.00, ""),
        ("Insulation", "Resilient Channel + Fiberglass (2x6) M+L", "sq ft", 0.00, 3.75, 3.75, ""),
        
        # DRYWALL
        ("Drywall", "Complete Service (Hang, Mud, Tape, Sand)", "sq ft", 1.00, 5.40, 6.40, ""),
        ("Drywall", "8' Wall - ONE SIDE Complete", "LF", 65.80, 0.00, 65.80, "$8.25/sq ft"),
        ("Drywall", "8' Wall - BOTH SIDES Complete", "LF", 117.00, 0.00, 117.00, "Frame: $14.60/LF + Drywall each side"),
        ("Drywall", "Ceiling/Wall Strapping (M+L)", "sq ft", 0.00, 1.45, 1.45, "Uses 1x3 wood strapping"),
        
        # PAINTING
        ("Painting", "General Painting (coverage area)", "sq ft", 0.00, 1.75, 1.75, ""),
        ("Painting", "Doors (2 coats)", "each", 0.00, 150.00, 150.00, ""),
        ("Painting", "Baseboards (2 coats)", "LF", 0.00, 2.00, 2.00, ""),
        ("Painting", "Crown Molding (2 coats)", "LF", 0.00, 2.00, 2.00, ""),
        
        # DOORS & TRIM
        ("Doors", "Standard Door Installation + Paint", "each", 0.00, 200.00, 200.00, "+$15 per glass panel"),
        ("Doors", "2¾\" Trim (painted, material included)", "LF", 5.50, 0.00, 5.50, ""),
        ("Doors", "3½\" Trim (painted, material included)", "LF", 6.15, 0.00, 6.15, ""),
        ("Doors", "2¾\" MDF (painted complete)", "LF", 9.45, 0.00, 9.45, "$7 labor + $0.45 material + $2 paint"),
    ]
    
    for item in pricing_data:
        existing = PricingRate.query.filter_by(service_name=item[1]).first()
        if not existing:
            rate = PricingRate(
                category=item[0],
                service_name=item[1],
                unit_type=item[2],
                material_cost=item[3],
                labor_cost=item[4],
                total_rate=item[5],
                notes=item[6] if len(item) > 6 else ""
            )
            db.session.add(rate)
    
    db.session.commit()

# ============================================================================
# ROUTES - CLIENT MANAGEMENT
# ============================================================================

@app.route('/')
def index():
    """Dashboard home page."""
    clients = Client.query.order_by(Client.last_name).all()
    projects = Project.query.order_by(Project.created_at.desc()).limit(10).all()
    
    # Calculate totals
    total_clients = len(clients)
    active_projects = len([p for p in projects if p.status in ['Quote', 'Accepted', 'In Progress']])
    
    return render_template('index.html', 
                         clients=clients, 
                         projects=projects,
                         total_clients=total_clients,
                         active_projects=active_projects)

@app.route('/clients')
def list_clients():
    """List all clients."""
    clients = Client.query.order_by(Client.last_name, Client.first_name).all()
    return render_template('clients.html', clients=clients)

@app.route('/client/<int:client_id>')
def view_client(client_id):
    """View single client with their projects."""
    client = Client.query.get_or_404(client_id)
    projects = Project.query.filter_by(client_id=client_id).order_by(Project.created_at.desc()).all()
    return render_template('client_detail.html', client=client, projects=projects)

@app.route('/client/new', methods=['GET', 'POST'])
def new_client():
    """Add new client."""
    if request.method == 'POST':
        client = Client(
            first_name=request.form['first_name'],
            last_name=request.form['last_name'],
            email=request.form.get('email'),
            phone=request.form.get('phone'),
            address=request.form.get('address'),
            city=request.form.get('city'),
            province=request.form.get('province'),
            postal_code=request.form.get('postal_code'),
            notes=request.form.get('notes'),
            referral_source=request.form.get('referral_source')
        )
        db.session.add(client)
        db.session.commit()
        flash(f'Client {client.first_name} {client.last_name} added!', 'success')
        return redirect(url_for('view_client', client_id=client.id))
    
    return render_template('client_form.html', client=None)

@app.route('/client/<int:client_id>/edit', methods=['GET', 'POST'])
def edit_client(client_id):
    """Edit existing client."""
    client = Client.query.get_or_404(client_id)
    
    if request.method == 'POST':
        client.first_name = request.form['first_name']
        client.last_name = request.form['last_name']
        client.email = request.form.get('email')
        client.phone = request.form.get('phone')
        client.address = request.form.get('address')
        client.city = request.form.get('city')
        client.province = request.form.get('province')
        client.postal_code = request.form.get('postal_code')
        client.notes = request.form.get('notes')
        client.referral_source = request.form.get('referral_source')
        
        db.session.commit()
        flash(f'Client {client.first_name} {client.last_name} updated!', 'success')
        return redirect(url_for('view_client', client_id=client.id))
    
    return render_template('client_form.html', client=client)

@app.route('/client/<int:client_id>/delete', methods=['POST'])
def delete_client(client_id):
    """Delete a client (with warning)."""
    client = Client.query.get_or_404(client_id)
    
    if client.projects.count() > 0:
        flash('Cannot delete client with existing projects!', 'error')
        return redirect(url_for('view_client', client_id=client_id))
    
    db.session.delete(client)
    db.session.commit()
    flash(f'Client {client.first_name} {client.last_name} deleted!', 'success')
    return redirect(url_for('list_clients'))

# ============================================================================
# ROUTES - PROJECT MANAGEMENT
# ============================================================================

@app.route('/projects')
def list_projects():
    """List all projects."""
    projects = Project.query.order_by(Project.created_at.desc()).all()
    return render_template('projects.html', projects=projects)

@app.route('/project/<int:project_id>')
def view_project(project_id):
    """View single project with invoice lines."""
    project = Project.query.get_or_404(project_id)
    lines = InvoiceLine.query.filter_by(project_id=project_id).all()
    
    # Calculate totals
    subtotal = sum(line.line_total for line in lines)
    tax = subtotal * 0.13  # HST
    total = subtotal + tax
    
    return render_template('project_detail.html', 
                         project=project, 
                         lines=lines,
                         subtotal=subtotal,
                         tax=tax,
                         total=total)

@app.route('/client/<int:client_id>/project/new', methods=['GET', 'POST'])
def new_project(client_id):
    """Create new project for a client."""
    client = Client.query.get_or_404(client_id)
    
    if request.method == 'POST':
        project = Project(
            client_id=client_id,
            project_name=request.form['project_name'],
            status='Quote',
            quote_date=datetime.strptime(request.form['quote_date'], '%Y-%m-%d').date() if request.form.get('quote_date') else None,
            start_date=datetime.strptime(request.form['start_date'], '%Y-%m-%d').date() if request.form.get('start_date') else None,
            estimated_end_date=datetime.strptime(request.form['estimated_end_date'], '%Y-%m-%d').date() if request.form.get('estimated_end_date') else None,
            notes=request.form.get('notes')
        )
        db.session.add(project)
        db.session.commit()
        flash(f'Project {project.project_name} created!', 'success')
        return redirect(url_for('view_project', project_id=project.id))
    
    return render_template('project_form.html', client=client, project=None)

@app.route('/project/<int:project_id>/edit', methods=['GET', 'POST'])
def edit_project(project_id):
    """Edit existing project."""
    project = Project.query.get_or_404(project_id)
    
    if request.method == 'POST':
        project.project_name = request.form['project_name']
        project.status = request.form['status']
        project.quote_date = datetime.strptime(request.form['quote_date'], '%Y-%m-%d').date() if request.form.get('quote_date') else None
        project.start_date = datetime.strptime(request.form['start_date'], '%Y-%m-%d').date() if request.form.get('start_date') else None
        project.estimated_end_date = datetime.strptime(request.form['estimated_end_date'], '%Y-%m-%d').date() if request.form.get('estimated_end_date') else None
        project.notes = request.form.get('notes')
        
        db.session.commit()
        flash(f'Project {project.project_name} updated!', 'success')
        return redirect(url_for('view_project', project_id=project.id))
    
    return render_template('project_form.html', client=project.client, project=project)

@app.route('/project/<int:project_id>/delete', methods=['POST'])
def delete_project(project_id):
    """Delete a project."""
    project = Project.query.get_or_404(project_id)
    
    db.session.delete(project)
    db.session.commit()
    flash(f'Project {project.project_name} deleted!', 'success')
    return redirect(url_for('list_projects'))

# ============================================================================
# ROUTES - INVOICE LINES
# ============================================================================

@app.route('/project/<int:project_id>/line/new', methods=['GET', 'POST'])
def new_invoice_line(project_id):
    """Add invoice line to project."""
    project = Project.query.get_or_404(project_id)
    
    # Get available pricing rates for dropdown
    categories = db.session.query(PricingRate.category).distinct().all()
    categories = [c[0] for c in categories]
    
    # Get room breaks for this project
    room_breaks = RoomBreak.query.filter_by(project_id=project_id).order_by(RoomBreak.order).all()
    
    if request.method == 'POST':
        line = InvoiceLine(
            project_id=project_id,
            category=request.form['category'],
            service_name=request.form['service_name'],
            unit_type=request.form.get('unit_type', ''),
            description=request.form['description'],
            quantity=float(request.form['quantity']),
            unit_rate=float(request.form['unit_rate']),
            line_total=float(request.form['line_total']),
            notes=request.form.get('notes')
        )
        db.session.add(line)
        db.session.commit()
        flash(f'Line item added!', 'success')
        return redirect(url_for('view_project', project_id=project_id))
    
    # Get pricing rates for selected category
    selected_category = request.args.get('category', 'Framing')
    rates = PricingRate.query.filter_by(category=selected_category, is_active=True).all()
    
    return render_template('invoice_line_form.html', 
                         project=project, 
                         room_breaks=room_breaks,
                         categories=categories,
                         rates=rates)

@app.route('/line/<int:line_id>/delete', methods=['POST'])
def delete_invoice_line(line_id):
    """Delete an invoice line."""
    line = InvoiceLine.query.get_or_404(line_id)
    project_id = line.project_id
    
    db.session.delete(line)
    db.session.commit()
    flash('Line item deleted!', 'success')
    return redirect(url_for('view_project', project_id=project_id))

# ============================================================================
# ROUTES - ROOM BREAKS (Room/Area Organization)
# ============================================================================

@app.route('/project/<int:project_id>/room/new', methods=['GET', 'POST'])
def new_room_break(project_id):
    """Add a room break to organize quote by space."""
    project = Project.query.get_or_404(project_id)
    
    if request.method == 'POST':
        # Get the highest order number and add 1
        max_order = db.session.query(db.func.max(RoomBreak.order)).filter_by(project_id=project_id).scalar() or -1
        
        room_break = RoomBreak(
            project_id=project_id,
            room_name=request.form['room_name'],
            order=max_order + 1,
            notes=request.form.get('notes')
        )
        db.session.add(room_break)
        db.session.commit()
        flash(f'Room break "{room_break.room_name}" added!', 'success')
        return redirect(url_for('view_project', project_id=project_id))
    
    return render_template('room_break_form.html', project=project)

@app.route('/room/<int:room_id>/edit', methods=['GET', 'POST'])
def edit_room_break(room_id):
    """Edit a room break."""
    room_break = RoomBreak.query.get_or_404(room_id)
    
    if request.method == 'POST':
        room_break.room_name = request.form['room_name']
        room_break.notes = request.form.get('notes')
        db.session.commit()
        flash(f'Room "{room_break.room_name}" updated!', 'success')
        return redirect(url_for('view_project', project_id=room_break.project_id))
    
    return render_template('room_break_form.html', project=room_break.project, room_break=room_break)

@app.route('/room/<int:room_id>/delete', methods=['POST'])
def delete_room_break(room_id):
    """Delete a room break (moves lines to General)."""
    room_break = RoomBreak.query.get_or_404(room_id)
    project_id = room_break.project_id
    
    # Move all invoice lines from this room to the 'General' room or no room
    general_room = RoomBreak.query.filter_by(project_id=project_id, room_name='General').first()
    if general_room:
        InvoiceLine.query.filter_by(room_break_id=room_id).update({'room_break_id': general_room.id})
    else:
        # If no General room exists, just remove the room_break_id
        InvoiceLine.query.filter_by(room_break_id=room_id).update({'room_break_id': None})
    
    db.session.delete(room_break)
    db.session.commit()
    flash(f'Room "{room_break.room_name}" deleted (lines moved to General)', 'success')
    return redirect(url_for('view_project', project_id=project_id))

# ============================================================================
# API ENDPOINTS (for AJAX operations)
# ============================================================================

@app.route('/api/pricing-rates/<category>')
def get_pricing_rates(category):
    """Get pricing rates for a specific category."""
    rates = PricingRate.query.filter_by(category=category, is_active=True).all()
    return jsonify([r.to_dict() for r in rates])

@app.route('/api/clients/search')
def search_clients():
    """Search clients by name or email."""
    query = request.args.get('q', '').lower()
    
    if not query:
        return jsonify([])
    
    results = Client.query.filter(
        db.or_(
            db.and_(Client.first_name.ilike(f'%{query}%')),
            db.and_(Client.last_name.ilike(f'%{query}%'))
        ),
        Client.email.ilike(f'%{query}%')
    ).limit(10).all()
    
    return jsonify([c.to_dict() for c in results])

@app.route('/project/<int:project_id>/room-breaks')
def get_room_breaks(project_id):
    """API endpoint to get room breaks for a project."""
    room_breaks = RoomBreak.query.filter_by(project_id=project_id).order_by(RoomBreak.order).all()
    return jsonify([{
        'id': rb.id,
        'room_name': rb.room_name,
        'notes': rb.notes or '',
        'order': rb.order
    } for rb in room_breaks])

# ============================================================================
# MAIN EXECUTION
# ============================================================================

def create_app():
    """Application factory."""
    with app.app_context():
        db.create_all()
        init_pricing_database()
    return app

if __name__ == '__main__':
    app = create_app()
    print("=" * 60)
    print("ALD Direct Inc. - Invoicing System")
    print("=" * 60)
    print("\nStarting web server...")
    print("Access at: http://localhost:5000")
    print("\nPress Ctrl+C to stop the server\n")
    app.run(debug=True, host='0.0.0.0', port=5000)
