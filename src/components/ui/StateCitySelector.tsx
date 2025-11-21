import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GetState, GetCity, GetCountries } from 'react-country-state-city';
import type { State, City, Country } from 'react-country-state-city/dist/esm/types';

interface StateCitySelectorProps {
  selectedState: string;
  selectedCity: string;
  onStateChange: (state: string) => void;
  onCityChange: (city: string) => void;
  disabled?: boolean;
  stateLabel?: string;
  cityLabel?: string;
  stateRequired?: boolean;
  cityRequired?: boolean;
  className?: string;
}

export function StateCitySelector({
  selectedState,
  selectedCity,
  onStateChange,
  onCityChange,
  disabled = false,
  stateLabel = 'State',
  cityLabel = 'City',
  stateRequired = false,
  cityRequired = false,
  className = ''
}: StateCitySelectorProps) {
  const [states, setStates] = useState<State[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [selectedStateId, setSelectedStateId] = useState<number | null>(null);
  const [indiaCountryId, setIndiaCountryId] = useState<number | null>(null);

  // Load India country ID and states on component mount
  useEffect(() => {
    const loadIndiaData = async () => {
      try {
        // Get all countries to find India
        const countries = await GetCountries();
        const india = countries.find(c => c.iso2 === 'IN' || c.name === 'India');
        if (india) {
          setIndiaCountryId(india.id);
          // Load states for India
          const indianStates = await GetState(india.id);
          setStates(indianStates);
        }
      } catch (error) {
        console.error('Error loading India data:', error);
      }
    };
    loadIndiaData();
  }, []);

  // Load cities when selectedState changes
  useEffect(() => {
    const loadCities = async () => {
      if (selectedState && states.length > 0 && indiaCountryId) {
        const state = states.find(s => s.name === selectedState);
        if (state) {
          setSelectedStateId(state.id);
          try {
            // Load cities for the selected state
            const stateCities = await GetCity(indiaCountryId, state.id);
            setCities(stateCities);
          } catch (error) {
            console.error('Error loading cities:', error);
            setCities([]);
          }
        } else {
          // State not found, clear cities
          setCities([]);
          setSelectedStateId(null);
        }
      } else {
        // No state selected, clear cities
        setCities([]);
        setSelectedStateId(null);
      }
    };
    loadCities();
  }, [selectedState, states, indiaCountryId]);

  // Handle state selection
  const handleStateChange = async (stateName: string) => {
    const state = states.find(s => s.name === stateName);
    if (state && indiaCountryId) {
      setSelectedStateId(state.id);
      try {
        // Load cities for selected state
        const stateCities = await GetCity(indiaCountryId, state.id);
        setCities(stateCities);
      } catch (error) {
        console.error('Error loading cities:', error);
        setCities([]);
      }
      // Reset city when state changes
      onCityChange('');
    }
    onStateChange(stateName);
  };

  // Handle city selection
  const handleCityChange = (cityName: string) => {
    onCityChange(cityName);
  };

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`}>
      <div className="space-y-2">
        <Label htmlFor="state">
          {stateLabel} {stateRequired && '*'}
        </Label>
        <Select
          value={selectedState}
          onValueChange={handleStateChange}
          disabled={disabled}
        >
          <SelectTrigger id="state">
            <SelectValue placeholder="Select state" />
          </SelectTrigger>
          <SelectContent>
            {states.map((state) => (
              <SelectItem key={state.id} value={state.name}>
                {state.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="city">
          {cityLabel} {cityRequired && '*'}
        </Label>
        <Select
          value={selectedCity}
          onValueChange={handleCityChange}
          disabled={disabled || !selectedState}
        >
          <SelectTrigger id="city">
            <SelectValue placeholder={selectedState ? 'Select city' : 'Select state first'} />
          </SelectTrigger>
          <SelectContent>
            {cities.length > 0 ? (
              cities.map((city) => (
                <SelectItem key={city.name} value={city.name}>
                  {city.name}
                </SelectItem>
              ))
            ) : (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                {selectedState ? 'No cities available' : 'Select state first'}
              </div>
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

