import { useState, useEffect, useMemo } from 'react';
import { Plus, Star, Filter, Grid3x3, List, ChevronDown, X, ArrowUpDown, DollarSign, Heart, Library as LibraryIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getUserLibrary,
  getLibraryEntry,
  getGameByBarcode,
  getGameByBggId,
  createSharedGame,
  addGameToLibrary,
  updateLibraryEntry,
  removeGameFromLibrary,
  checkGameInUserCollections,
  addGameToWishlist,
} from '../lib/games';
import { lookupBarcodeWithBgg, submitBarcodeToGameUpc } from '../lib/bgg';
import { UserLibraryEntry, Game } from '../lib/supabase';
import GameCard from './GameCard';
import BarcodeScanner from './BarcodeScanner';
import EditGameModal from './EditGameModal';
import SearchSharedGamesModal from './SearchSharedGamesModal';
import ManualGameEntry from './ManualGameEntry';
import Wishlist from './Wishlist';
import Tooltip from './Tooltip';

type SortOption = 'name-asc' | 'name-desc' | 'date-added-desc' | 'date-added-asc' | 'plays-desc' | 'plays-asc';

export default function Library() {
  const { user, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'catalogue' | 'wishlist'>('catalogue');
  const [library, setLibrary] = useState<(UserLibraryEntry & { game: Game })[]>([]);
  const [filteredLibrary, setFilteredLibrary] = useState<(UserLibraryEntry & { game: Game })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string>('');
  const [editingGame, setEditingGame] = useState<(UserLibraryEntry & { game: Game }) | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [filterForSale, setFilterForSale] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [userLayout, setUserLayout] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('name-asc');

  const [filters, setFilters] = useState({
    publishers: [] as string[],
    gameTypes: [] as string[],
    gameCategories: [] as string[],
    rankings: [] as string[],
    minPlays: 0,
    maxPlays: Infinity,
    years: [] as string[],
    playerCounts: [] as number[],
  });

  const availableFilters = useMemo(() => {
    const publishers = new Set<string>();
    const gameTypes = new Set<string>();
    const gameCategories = new Set<string>();
    const years = new Set<string>();

    library.forEach((entry) => {
      if (entry.game.publisher) publishers.add(entry.game.publisher);
      if (entry.game.year) years.add(entry.game.year);
      entry.game.game_type?.forEach((type) => gameTypes.add(type));
      entry.game.game_category?.forEach((cat) => gameCategories.add(cat));
    });

    return {
      publishers: Array.from(publishers).sort(),
      gameTypes: Array.from(gameTypes).sort(),
      gameCategories: Array.from(gameCategories).sort(),
      years: Array.from(years).sort(),
    };
  }, [library]);

  useEffect(() => {
    if (user) {
      loadLibrary();
    }
  }, [user]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 480) {
        setLayout('list');
      } else {
        setLayout(userLayout);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [userLayout]);

  useEffect(() => {
    let filtered = [...library];

    if (searchQuery) {
      filtered = filtered.filter(
        (entry) =>
          entry.game.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          entry.game.publisher?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          entry.game.barcode.includes(searchQuery)
      );
    }

    if (filterFavorites) {
      filtered = filtered.filter((entry) => entry.is_favorite);
    }

    if (filterForSale) {
      filtered = filtered.filter((entry) => entry.for_sale);
    }

    if (filters.publishers.length > 0) {
      filtered = filtered.filter(
        (entry) => entry.game.publisher && filters.publishers.includes(entry.game.publisher)
      );
    }

    if (filters.gameTypes.length > 0) {
      filtered = filtered.filter((entry) =>
        entry.game.game_type?.some((type) => filters.gameTypes.includes(type))
      );
    }

    if (filters.gameCategories.length > 0) {
      filtered = filtered.filter((entry) =>
        entry.game.game_category?.some((cat) => filters.gameCategories.includes(cat))
      );
    }

    if (filters.rankings.length > 0) {
      filtered = filtered.filter(
        (entry) => entry.personal_ranking && filters.rankings.includes(entry.personal_ranking)
      );
    }

    if (filters.years.length > 0) {
      filtered = filtered.filter((entry) => entry.game.year && filters.years.includes(entry.game.year));
    }

    const playsCount = (entry: UserLibraryEntry & { game: Game }) =>
      entry.played_dates?.length || 0;

    if (filters.minPlays > 0) {
      filtered = filtered.filter((entry) => playsCount(entry) >= filters.minPlays);
    }

    if (filters.maxPlays !== Infinity) {
      filtered = filtered.filter((entry) => playsCount(entry) <= filters.maxPlays);
    }

    if (filters.playerCounts.length > 0) {
      filtered = filtered.filter((entry) => {
        const minPlayers = entry.game.min_players;
        const maxPlayers = entry.game.max_players;

        if (!minPlayers && !maxPlayers) return false;

        return filters.playerCounts.some((count) => {
          if (count === 6) {
            if (!minPlayers && maxPlayers) return maxPlayers >= 6;
            if (minPlayers && !maxPlayers) return true;
            return (maxPlayers && maxPlayers >= 6) || (minPlayers && minPlayers >= 6);
          }

          if (!minPlayers && maxPlayers) return count <= maxPlayers;
          if (minPlayers && !maxPlayers) return count >= minPlayers;
          return minPlayers && maxPlayers && count >= minPlayers && count <= maxPlayers;
        });
      });
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':
          return a.game.name.localeCompare(b.game.name, 'en', {
            sensitivity: 'base',
            numeric: true,
            ignorePunctuation: false
          });
        case 'name-desc':
          return b.game.name.localeCompare(a.game.name, 'en', {
            sensitivity: 'base',
            numeric: true,
            ignorePunctuation: false
          });
        case 'date-added-desc':
          return new Date(b.added_date).getTime() - new Date(a.added_date).getTime();
        case 'date-added-asc':
          return new Date(a.added_date).getTime() - new Date(b.added_date).getTime();
        case 'plays-desc':
          return playsCount(b) - playsCount(a);
        case 'plays-asc':
          return playsCount(a) - playsCount(b);
        default:
          return 0;
      }
    });

    setFilteredLibrary(filtered);
  }, [library, searchQuery, filterFavorites, filterForSale, filters, sortBy]);

  const loadLibrary = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const data = await getUserLibrary(user.id);
      setLibrary(data);
    } catch (error) {
      console.error('Error loading library:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGameAdded = async () => {
    await loadLibrary();
    await refreshProfile();
  };

  const handleScanBarcode = async (barcode: string, addToWishlist: boolean = false) => {
    if (!user) return;

    try {
      let game = await getGameByBarcode(barcode);

      if (!game) {
        try {
          // Use new secure BGG lookup that fetches full game data
          const gameData = await lookupBarcodeWithBgg(barcode);

          // Check if a game with this BGG ID already exists in shared_games
          // This prevents duplicate entries when the same game has different barcodes
          if (gameData.bgg_id) {
            const existingGame = await getGameByBggId(gameData.bgg_id);
            if (existingGame) {
              game = existingGame;
              console.log(`Game already exists with BGG ID ${gameData.bgg_id}, using existing entry`);
            }
          }

          // If no existing game found, create a new one
          if (!game) {
            game = await createSharedGame({
              barcode,
              name: gameData.name || 'Unknown Game',
              bgg_id: gameData.bgg_id,
              publisher: gameData.publisher,
              year: gameData.year?.toString(),
              cover_image: gameData.cover_image,
              min_players: gameData.min_players,
              max_players: gameData.max_players,
              playtime_minutes: gameData.playtime_minutes,
              game_type: gameData.game_type,
              game_category: gameData.game_category,
              game_mechanic: gameData.game_mechanic,
              game_family: gameData.game_family,
            });
          }

          // If the barcode was found via a backup API (not GameUPC), submit to GameUPC
          if (gameData.source !== 'gameupc' && gameData.bgg_id) {
            submitBarcodeToGameUpc(barcode, gameData.bgg_id).catch((err) => {
              console.error('Failed to submit barcode mapping (non-fatal):', err);
            });
          }
        } catch (lookupError) {
          console.error('Barcode lookup failed:', lookupError);
          setScannedBarcode(barcode);
          setShowScanner(false);
          setShowManualEntry(true);
          return;
        }
      }

      // Check if game is already in user's collections
      const collections = await checkGameInUserCollections(user.id, game.id);
      if (collections.inLibrary || (addToWishlist && collections.inWishlist)) {
        setShowScanner(false);
        setShowDuplicateModal(true);
        return;
      }

      if (addToWishlist) {
        await addGameToWishlist(user.id, game.id);
      } else {
        await addGameToLibrary(user.id, game.id);
        await loadLibrary();
      }

      await refreshProfile();
      setShowScanner(false);
    } catch (error) {
      console.error('Error adding game:', error);
      alert('Failed to add game. Please try again.');
    }
  };

  const handleManualGameEntry = async (gameData: {
    barcode: string;
    bgg_id?: number;
    name: string;
    publisher?: string;
    year?: number;
    cover_image?: string;
    min_players?: number;
    max_players?: number;
    playtime_minutes?: number;
    min_age?: number;
    game_type?: string[];
    game_category?: string[];
    game_mechanic?: string[];
    description?: string;
  }, addToWishlist: boolean = false) => {
    if (!user) return;

    try {
      // Check if a game with this BGG ID already exists in shared_games
      // This prevents duplicate entries when the same game has different barcodes
      let game = null;
      if (gameData.bgg_id) {
        game = await getGameByBggId(gameData.bgg_id);
        if (game) {
          console.log(`Game already exists with BGG ID ${gameData.bgg_id}, using existing entry`);
        }
      }

      // If no existing game found, create a new one
      if (!game) {
        // Generate a placeholder barcode if none was provided (manual entry without scanning)
        // Format: MANUAL-{BGG_ID}-{TIMESTAMP} or MANUAL-UNKNOWN-{TIMESTAMP}
        const barcode = gameData.barcode ||
          `MANUAL-${gameData.bgg_id || 'UNKNOWN'}-${Date.now()}`;

        // Create game with all BGG data from manual search
        game = await createSharedGame({
          barcode,
          bgg_id: gameData.bgg_id,
          name: gameData.name,
          publisher: gameData.publisher,
          year: gameData.year?.toString(),
          cover_image: gameData.cover_image,
          min_players: gameData.min_players,
          max_players: gameData.max_players,
          playtime_minutes: gameData.playtime_minutes,
          game_type: gameData.game_type,
          game_category: gameData.game_category,
          game_mechanic: gameData.game_mechanic,
        });
      }

      // If we have a BGG ID, submit the barcode mapping to GameUPC
      // This helps improve the GameUPC database for future users
      if (gameData.bgg_id && gameData.barcode) {
        submitBarcodeToGameUpc(gameData.barcode, gameData.bgg_id).catch((err) => {
          console.error('Failed to submit barcode mapping (non-fatal):', err);
        });
      }

      if (addToWishlist) {
        await addGameToWishlist(user.id, game.id);
      } else {
        await addGameToLibrary(user.id, game.id);
        await loadLibrary();
      }

      await refreshProfile();
      setShowManualEntry(false);
      setScannedBarcode('');
    } catch (error) {
      console.error('Error adding manual game:', error);
      alert('Failed to add game. Please try again.');
    }
  };

  const handleToggleFavorite = async (entryId: string, isFavorite: boolean) => {
    try {
      await updateLibraryEntry(entryId, { is_favorite: isFavorite });
      const updatedEntry = await getLibraryEntry(entryId);
      setLibrary((prev) => prev.map((entry) => (entry.id === entryId ? updatedEntry : entry)));
      await refreshProfile();
    } catch (error) {
      console.error('Error updating favorite:', error);
    }
  };

  const handleToggleForSale = async (entryId: string, forSale: boolean) => {
    try {
      await updateLibraryEntry(entryId, { for_sale: forSale });
      const updatedEntry = await getLibraryEntry(entryId);
      setLibrary((prev) => prev.map((entry) => (entry.id === entryId ? updatedEntry : entry)));
      await refreshProfile();
    } catch (error) {
      console.error('Error updating for sale status:', error);
    }
  };

  const handleDeleteGame = async (entryId: string) => {
    const entry = library.find((e) => e.id === entryId);
    const gameName = entry?.game.name || 'this game';

    if (!confirm(`Are you sure you want to remove "${gameName}" from your library?`)) {
      return;
    }

    try {
      await removeGameFromLibrary(entryId);
      await loadLibrary();
      await refreshProfile();
    } catch (error) {
      console.error('Error deleting game:', error);
    }
  };

  const handleSaveEdit = async (entryId: string, updates: Partial<UserLibraryEntry>) => {
    try {
      await updateLibraryEntry(entryId, updates);
      const updatedEntry = await getLibraryEntry(entryId);
      setLibrary((prev) => prev.map((entry) => (entry.id === entryId ? updatedEntry : entry)));
      await refreshProfile();
      setEditingGame(null);
    } catch (error) {
      console.error('Error updating game:', error);
    }
  };

  const handleAddPlay = async (entryId: string) => {
    const entry = library.find((e) => e.id === entryId);
    if (!entry) return;

    const today = new Date().toISOString().split('T')[0];
    const currentDates = entry.played_dates || [];
    const updatedDates = [...currentDates, today].sort().reverse();

    try {
      await updateLibraryEntry(entryId, { played_dates: updatedDates });
      const updatedEntry = await getLibraryEntry(entryId);
      setLibrary((prev) => prev.map((entry) => (entry.id === entryId ? updatedEntry : entry)));
      await refreshProfile();
    } catch (error) {
      console.error('Error adding play:', error);
    }
  };

  const toggleFilterValue = (category: keyof typeof filters, value: string) => {
    setFilters((prev) => {
      const currentValues = prev[category] as string[];
      const newValues = currentValues.includes(value)
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value];
      return { ...prev, [category]: newValues };
    });
  };

  const clearAllFilters = () => {
    setFilters({
      publishers: [],
      gameTypes: [],
      gameCategories: [],
      rankings: [],
      minPlays: 0,
      maxPlays: Infinity,
      years: [],
      playerCounts: [],
    });
    setFilterFavorites(false);
    setFilterForSale(false);
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filterFavorites) count++;
    if (filterForSale) count++;
    count += filters.publishers.length;
    count += filters.gameTypes.length;
    count += filters.gameCategories.length;
    count += filters.rankings.length;
    count += filters.years.length;
    count += filters.playerCounts.length;
    if (filters.minPlays > 0) count++;
    if (filters.maxPlays !== Infinity) count++;
    return count;
  }, [filterFavorites, filterForSale, filters]);

  return (
    <div className="min-h-screen bg-cream">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-8 sm:py-12">
        {/* Navigation Tabs */}
        <div className="mb-8 sm:mb-12">
          <div className="flex border-b thin-rule rule-line">
            <button
              onClick={() => setActiveTab('catalogue')}
              className={`flex items-center gap-2 px-6 py-4 font-body text-sm uppercase tracking-wider transition ${
                activeTab === 'catalogue'
                  ? 'border-b-2 border-slate-900 text-slate-900'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LibraryIcon className="w-4 h-4" strokeWidth={1.5} />
              <span>My Catalogue</span>
            </button>
            <button
              onClick={() => setActiveTab('wishlist')}
              className={`flex items-center gap-2 px-6 py-4 font-body text-sm uppercase tracking-wider transition ${
                activeTab === 'wishlist'
                  ? 'border-b-2 border-terracotta-500 text-terracotta-700'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Heart className="w-4 h-4" strokeWidth={1.5} />
              <span>Wishlist</span>
            </button>
          </div>
        </div>

        {activeTab === 'wishlist' ? (
          <Wishlist />
        ) : (
          <div>
        <div className="mb-8 sm:mb-12 space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 border-b thin-rule rule-line pb-6">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search catalogue..."
                className="w-full px-4 py-3 text-sm font-body bg-cream border thin-rule rule-line focus:outline-none focus:bg-white transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  <X className="w-4 h-4" strokeWidth={1.5} />
                </button>
              )}
            </div>

            <button
              onClick={() => setShowScanner(true)}
              className="flex items-center justify-center gap-2 bg-slate-900 text-cream px-6 py-3 hover:bg-slate-800 transition-colors font-body text-sm"
            >
              <Plus className="w-4 h-4" strokeWidth={1.5} />
              <span>New Entry</span>
            </button>
          </div>

          <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:flex-wrap sm:gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2 border thin-rule rule-line transition text-xs font-body uppercase tracking-wider ${
                  showFilters || activeFiltersCount > 0
                    ? 'bg-slate-900 text-cream'
                    : 'bg-cream text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Filter className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>Filters</span>
                {activeFiltersCount > 0 && (
                  <span className="bg-terracotta-500 text-cream text-xs px-1.5 py-0.5">
                    {activeFiltersCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => setFilterFavorites(!filterFavorites)}
                className={`flex items-center gap-2 px-4 py-2 border thin-rule rule-line transition text-xs font-body uppercase tracking-wider ${
                  filterFavorites
                    ? 'bg-gold-500 text-slate-900'
                    : 'bg-cream text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Star className="w-3.5 h-3.5" fill={filterFavorites ? 'currentColor' : 'none'} strokeWidth={1.5} />
                <span>Starred</span>
              </button>

              <button
                onClick={() => setFilterForSale(!filterForSale)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg border transition text-xs sm:text-sm font-medium ${
                  filterForSale
                    ? 'bg-green-50 border-green-300 text-green-900'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>For Sale</span>
              </button>

              {activeFiltersCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="text-xs sm:text-sm text-slate-600 hover:text-slate-900 underline px-1"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="appearance-none bg-white border border-slate-300 rounded-lg pl-2 sm:pl-3 pr-7 sm:pr-8 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none w-full"
                >
                  <option value="name-asc">Name (A-Z)</option>
                  <option value="name-desc">Name (Z-A)</option>
                  <option value="date-added-desc">Recently Added</option>
                  <option value="date-added-asc">Oldest First</option>
                  <option value="plays-desc">Most Played</option>
                  <option value="plays-asc">Least Played</option>
                </select>
                <ArrowUpDown className="absolute right-1.5 sm:right-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 pointer-events-none" />
              </div>

              <div className="flex items-center space-x-0.5 sm:space-x-1 border border-slate-300 rounded-lg p-0.5 sm:p-1">
                <Tooltip content="Grid view">
                  <button
                    onClick={() => {
                      setUserLayout('grid');
                      if (window.innerWidth > 480) {
                        setLayout('grid');
                      }
                    }}
                    className={`p-1.5 sm:p-2 rounded transition ${
                      layout === 'grid'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Grid3x3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                </Tooltip>
                <Tooltip content="List view">
                  <button
                    onClick={() => {
                      setUserLayout('list');
                      setLayout('list');
                    }}
                    className={`p-1.5 sm:p-2 rounded transition ${
                      layout === 'list'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <List className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>

          {showFilters && (
            <div className="bg-white rounded-lg border border-container p-3 sm:p-6 space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {availableFilters.publishers.length > 0 && (
                  <MultiSelectDropdown
                    title="Publisher"
                    options={availableFilters.publishers}
                    selected={filters.publishers}
                    onToggle={(value) => toggleFilterValue('publishers', value)}
                    onClear={() => setFilters({ ...filters, publishers: [] })}
                  />
                )}

                {availableFilters.gameTypes.length > 0 && (
                  <FilterSection
                    title="Game Type"
                    options={availableFilters.gameTypes}
                    selected={filters.gameTypes}
                    onToggle={(value) => toggleFilterValue('gameTypes', value)}
                  />
                )}

                {availableFilters.gameCategories.length > 0 && (
                  <FilterSection
                    title="Category"
                    options={availableFilters.gameCategories}
                    selected={filters.gameCategories}
                    onToggle={(value) => toggleFilterValue('gameCategories', value)}
                  />
                )}

                {availableFilters.years.length > 0 && (
                  <MultiSelectDropdown
                    title="Year"
                    options={availableFilters.years}
                    selected={filters.years}
                    onToggle={(value) => toggleFilterValue('years', value)}
                    onClear={() => setFilters({ ...filters, years: [] })}
                  />
                )}

                <FilterSection
                  title="Ranking"
                  options={['high', 'medium', 'low']}
                  selected={filters.rankings}
                  onToggle={(value) => toggleFilterValue('rankings', value)}
                />

                <div>
                  <h4 className="text-sm font-medium text-slate-900 mb-3">Number of Plays</h4>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-slate-600">Minimum</label>
                      <input
                        type="number"
                        min="0"
                        value={filters.minPlays}
                        onChange={(e) =>
                          setFilters({ ...filters, minPlays: parseInt(e.target.value) || 0 })
                        }
                        className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-600">Maximum</label>
                      <input
                        type="number"
                        min="0"
                        value={filters.maxPlays === Infinity ? '' : filters.maxPlays}
                        onChange={(e) =>
                          setFilters({
                            ...filters,
                            maxPlays: e.target.value ? parseInt(e.target.value) : Infinity,
                          })
                        }
                        placeholder="No limit"
                        className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-slate-900 mb-3">Number of Players</h4>
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5, 6].map((count) => (
                      <label key={count} className="flex items-center space-x-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={filters.playerCounts.includes(count)}
                          onChange={() => {
                            setFilters((prev) => ({
                              ...prev,
                              playerCounts: prev.playerCounts.includes(count)
                                ? prev.playerCounts.filter((c) => c !== count)
                                : [...prev.playerCounts, count],
                            }));
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                        />
                        <span className="text-sm text-slate-700 group-hover:text-slate-900">
                          {count === 6 ? '6+' : count} {count === 1 ? 'player' : 'players'}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
          </div>
        ) : filteredLibrary.length === 0 ? (
          <div className="text-center py-20">
            <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Plus className="w-10 h-10 text-slate-400" />
            </div>
            <h3 className="text-xl font-display font-light text-slate-900 mb-2">
              {library.length === 0 ? 'No games yet' : 'No games match your search'}
            </h3>
            <p className="text-slate-600 mb-6">
              {library.length === 0
                ? 'Start building your collection by scanning a barcode'
                : 'Try adjusting your search or filters'}
            </p>
            <button
              onClick={() => setShowScanner(true)}
              className="inline-flex items-center space-x-2 bg-slate-900 text-white px-6 py-3 rounded-lg hover:bg-slate-800 transition font-medium"
            >
              <Plus className="w-5 h-5" />
              <span>{library.length === 0 ? 'Add Your First Game' : 'Add a new game'}</span>
            </button>
          </div>
        ) : layout === 'list' ? (
          <div className="space-y-3">
            {filteredLibrary.map((entry) => (
              <GameCard
                key={entry.id}
                entry={entry}
                onToggleFavorite={handleToggleFavorite}
                onToggleForSale={handleToggleForSale}
                onDelete={handleDeleteGame}
                onEdit={setEditingGame}
                onAddPlay={handleAddPlay}
                layout="list"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-0.5">
            {filteredLibrary.map((entry) => (
              <GameCard
                key={entry.id}
                entry={entry}
                onToggleFavorite={handleToggleFavorite}
                onToggleForSale={handleToggleForSale}
                onDelete={handleDeleteGame}
                onEdit={setEditingGame}
                onAddPlay={handleAddPlay}
                layout="grid"
              />
            ))}
          </div>
        )}
          </div>
        )}
      </main>

      {/* Modals */}
      {showSearchModal && user && (
        <SearchSharedGamesModal
          userId={user.id}
          onClose={() => setShowSearchModal(false)}
          onGameAdded={handleGameAdded}
          onAddNew={() => {
            setShowSearchModal(false);
            setShowScanner(true);
          }}
        />
      )}

      {showScanner && (
        <BarcodeScanner
          onScan={handleScanBarcode}
          onClose={() => setShowScanner(false)}
          onManualEntry={() => {
            setShowScanner(false);
            setScannedBarcode('');
            setShowManualEntry(true);
          }}
        />
      )}

      {showManualEntry && (
        <ManualGameEntry
          barcode={scannedBarcode}
          onSave={handleManualGameEntry}
          onClose={() => {
            setShowManualEntry(false);
            setScannedBarcode('');
          }}
        />
      )}

      {editingGame && (
        <EditGameModal
          entry={editingGame}
          onSave={handleSaveEdit}
          onClose={() => setEditingGame(null)}
          onDelete={handleDeleteGame}
        />
      )}

      {showDuplicateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Already in Library</h2>
            <p className="text-slate-700 mb-6">
              This game is already in your library.
            </p>
            <button
              onClick={() => setShowDuplicateModal(false)}
              className="w-full bg-slate-900 text-white py-3 rounded-lg font-semibold hover:bg-slate-800 transition"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSection({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const displayOptions = showAll ? options : options.slice(0, 5);

  return (
    <div>
      <h4 className="text-sm font-medium text-slate-900 mb-3">{title}</h4>
      <div className="space-y-2">
        {displayOptions.map((option) => (
          <label key={option} className="flex items-center space-x-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => onToggle(option)}
              className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
            />
            <span className="text-sm text-slate-700 group-hover:text-slate-900 capitalize">
              {option}
            </span>
          </label>
        ))}
        {options.length > 5 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-slate-600 hover:text-slate-900 underline"
          >
            {showAll ? 'Show less' : `Show ${options.length - 5} more`}
          </button>
        )}
      </div>
    </div>
  );
}

function MultiSelectDropdown({
  title,
  options,
  selected,
  onToggle,
  onClear,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-slate-900">{title}</h4>
        {selected.length > 0 && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-slate-600 hover:text-slate-900 underline"
            title="Clear all selections"
          >
            Clear
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 text-left bg-white border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition flex items-center justify-between"
        title={selected.length === 0 ? `Select ${title.toLowerCase()}` : `${selected.length} ${title.toLowerCase()} selected`}
      >
        <span className="truncate">
          {selected.length === 0 ? `Select ${title.toLowerCase()}...` : `${selected.length} selected`}
        </span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute z-20 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500">No options available</div>
            ) : (
              options.map((option) => (
                <label
                  key={option}
                  className="flex items-center space-x-2 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={() => onToggle(option)}
                    className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                  />
                  <span className="text-sm text-slate-700 capitalize">{option}</span>
                </label>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
