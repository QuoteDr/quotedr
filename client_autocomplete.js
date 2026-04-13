// Client Autocomplete System for ALD Direct Quote Builder
// Smart search with fuzzy matching and auto-fill

const clientDatabase = {
  "Adrian Wade Kitchen Outlets": {"filename": "24.03 Adrian Wade Kitchen Outlets.pdf", "phone": null, "email": null},
  "Alexandra Rawlings": {"filename": "25.16 Alexandra Rawlings - Front Deck.pdf", "phone": null, "email": null},
  "Ali Al Dujaili": {"filename": "25.17 Ali Al Dujaili - Paint Flower Beds.pdf", "phone": null, "email": null},
  "Amanda and David Maclennan": {"filename": "25.12 Amanda and David Maclennan - Full Renovation.pdf", "phone": null, "email": null},
  "Andrew Pembleton": {"filename": "24.44 Andrew Pembleton - Fence and Shed.pdf", "phone": null, "email": null},
  "Brenda Pinkus": {"filename": "24.40 Brenda Pinkus - Condo Repairs.pdf", "phone": null, "email": null},
  "Carrie Hutton": {"filename": "24.15 Carrie Hutton.pdf", "phone": null, "email": null},
  "Concept Wraps": {"filename": "24.35A Concept Wraps - Paint - Copy.pdf", "phone": null, "email": null},
  "Elena Williamson": {"filename": "25.22 Elena Williamson - Attic Insulation.pdf", "phone": null, "email": null},
  "Elizabeth Craig": {"filename": "24.49 Elizabeth Craig - Drywall Repair.pdf", "phone": null, "email": null},
  "Evan Anderson": {"filename": "25.14 Evan Anderson - Door, window trim, railing.pdf", "phone": null, "email": null},
  "Evan Gelman": {"filename": "24.41 Evan Gelman - Laundry Room.pdf", "phone": null, "email": null},
  "Fiona Morrison": {"filename": "26.02 Fiona Morrison - Railing and Shower Door.pdf", "phone": null, "email": null},
  "Gerry and Nicole Deck Clean and Stain": {"filename": "25.19 Gerry and Nicole Deck Clean and Stain.pdf", "phone": null, "email": null},
  "Gerry and Nicole Deck Reface": {"filename": "25.20 Gerry and Nicole Deck Reface.pdf", "phone": null, "email": null},
  "Jackie and Kaya Smith": {"filename": "25.09A Jackie and Kaya Smith - Bathtub.pdf", "phone": null, "email": null},
  "Joseph Sant": {"filename": "25.02 Joseph Sant - Bathroom.pdf", "phone": null, "email": null},
  "Kyle Hosiac Shed": {"filename": "24.14B Kyle Hosiac Shed.pdf", "phone": null, "email": null},
  "Liz Wilson, Basement": {"filename": "24.08 Liz Wilson, Basement.pdf", "phone": null, "email": null},
  "Mahbubur Rahman 84 Rayne Venting": {"filename": "24.32 Mahbubur Rahman 84 Rayne Venting.pdf", "phone": null, "email": null},
  "Mallory Peirce": {"filename": "24.52 Mallory Peirce - Kitchen.pdf", "phone": null, "email": null},
  "Mat Pecaric, Flooring": {"filename": "24.07 Mat Pecaric, Flooring.pdf", "phone": null, "email": null},
  "Michelle Ventrella": {"filename": "24.02 Michelle Ventrella.pdf", "phone": null, "email": null},
  "Mike Anderson": {"filename": "25.07 Mike Anderson - Master Bedroom.pdf", "phone": null, "email": null},
  "Mike Urban, Self Leveler": {"filename": "24.13 Mike Urban, Self Leveler.pdf", "phone": null, "email": null},
  "Mike and Dianne Cupples Fireplace": {"filename": "24.20 Mike and Dianne Cupples Fireplace.pdf", "phone": null, "email": null},
  "Neil Garraway 173 Thomas St.": {"filename": "24.21 Neil Garraway 173 Thomas St..pdf", "phone": null, "email": null},
  "Orysa Steele": {"filename": "24.22 Orysa Steele Swap Garage Lights.pdf", "phone": null, "email": null},
  "Peter Morris Shed and Shutters": {"filename": "24.24 Peter Morris Shed and Shutters.pdf", "phone": null, "email": null},
  "Pinkus Interiors": {"filename": "25.26 Pinkus Interiors - Haddon.pdf", "phone": null, "email": null},
  "Pranav Kapoor": {"filename": "24.04 Pranav Kapoor.pdf", "phone": null, "email": null},
  "Rob Becker": {"filename": "25.15A Rob Becker - Feature Wall.pdf", "phone": null, "email": null},
  "Rosa and Doug Carrick": {"filename": "25.17 Rosa and Doug Carrick - Laundry.pdf", "phone": null, "email": null},
  "Samantha and Kevin Matten": {"filename": "25.21 Samantha and Kevin Matten - Faucet + Micro-Hood.pdf", "phone": null, "email": null},
  "Sheila Maher": {"filename": "25.08 Sheila Maher - Exterior Cameras and Lock.pdf", "phone": null, "email": null},
  "Sherri Basement": {"filename": "24.33 Sherri Basement.pdf", "phone": null, "email": null},
  "Sherri Bathroom With Bathtub": {"filename": "24.31B Sherri Bathroom With Bathtub.pdf", "phone": null, "email": null},
  "Steve Tylliros": {"filename": "24.38 Steve Tylliros - Outdoor Receptacles.pdf", "phone": null, "email": null},
  "Thomas Hamilton": {"filename": "24.37 Thomas Hamilton - Shed.pdf", "phone": null, "email": null},
  "Tiago Vieira": {"filename": "24.35 Tiago Vieira - Paint.pdf", "phone": null, "email": null},
  "Tracy Quennell": {"filename": "24.05 Tracy Quennell.pdf", "phone": null, "email": null},
  "Tracy Rivers": {"filename": "24.05A Tracy Rivers.pdf", "phone": null, "email": null},
  "Victoria Niven, James Miller": {"filename": "24.39B Victoria Niven, James Miller - Basement FINAL .pdf", "phone": null, "email": null},
  "Patrick Slaughter": {"filename": "23.34a Patrick Slaughter, Flooring and Baseboards.pdf", "phone": null, "email": null}
};

// Fuzzy matching function (Levenshtein distance)
function fuzzyMatch(query, text) {
  query = query.toLowerCase().trim();
  text = text.toLowerCase().trim();
  
  // Exact match first
  if (query === text) return { score: 100, exact: true };
  
  // Contains check
  if (text.includes(query)) return { score: 90, exact: false };
  
  // Calculate similarity score
  const distances = [];
  for (let i = 0; i < text.length; i++) {
    let j = 0;
    while (j < query.length && text[i + j] === query[j]) {
      j++;
    }
    if (j > 0) {
      distances.push(j);
    }
  }
  
  const maxMatch = Math.max(...distances, 0);
  const score = (maxMatch / query.length) * 100;
  
  return { score: score, exact: false };
}

// Search clients based on input
function searchClients(query) {
  if (!query || query.length < 2) return [];
  
  const results = [];
  
  for (const [clientName, data] of Object.entries(clientDatabase)) {
    const match = fuzzyMatch(query, clientName);
    if (match.score > 50) { // Only show matches with score > 50%
      results.push({ name: clientName, ...data, score: match.score });
    }
  }
  
  // Sort by score descending
  return results.sort((a, b) => b.score - a.score);
}

// Auto-fill form fields when client is selected
function fillClientInfo(clientName) {
  const clientData = clientDatabase[clientName];
  if (!clientData) return;
  
  // Fill in the client name field
  document.getElementById('client-name').value = clientName;
  
  // Note: Phone, email, and address would be filled here when extracted from PDFs
  // For now, these fields are ready for manual entry or future integration
  
  console.log(`Client ${clientName} selected`);
}

// Initialize autocomplete dropdown
function initAutocomplete() {
  const nameInput = document.getElementById('client-name');
  if (!nameInput) return;
  
  // Create dropdown container
  const dropdown = document.createElement('div');
  dropdown.id = 'client-autocomplete';
  dropdown.className = 'autocomplete-dropdown';
  nameInput.parentNode.appendChild(dropdown);
  
  // Show/hide dropdown on input
  nameInput.addEventListener('input', function() {
    const query = this.value;
    const results = searchClients(query);
    
    if (results.length > 0) {
      showDropdown(results, dropdown);
    } else {
      hideDropdown(dropdown);
    }
  });
  
  // Click outside to close
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.autocomplete-container')) {
      hideDropdown(dropdown);
    }
  });
}

function showDropdown(results, container) {
  container.innerHTML = '';
  container.style.display = 'block';
  
  results.forEach(client => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    if (client.exact) item.classList.add('exact-match');
    
    // Highlight matching text
    let displayName = client.name;
    if (!client.exact) {
      // Simple highlighting - could be improved with regex
      const query = document.getElementById('client-name').value.toLowerCase();
      const index = displayName.toLowerCase().indexOf(query);
      if (index >= 0) {
        displayName = displayName.substring(0, index) + 
                     '<strong>' + displayName.substring(index, index + query.length) + '</strong>' + 
                     displayName.substring(index + query.length);
      }
    }
    
    item.innerHTML = `<span>${displayName}</span> <small class="text-muted">(${client.filename})</small>`;
    item.onclick = function() {
      fillClientInfo(client.name);
      hideDropdown(container);
      document.getElementById('client-name').value = client.name;
    };
    
    container.appendChild(item);
  });
}

function hideDropdown(container) {
  container.style.display = 'none';
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initAutocomplete);
