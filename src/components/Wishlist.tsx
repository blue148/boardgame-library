import { useState, useEffect, useMemo } from 'react';
import { Filter, Grid3x3, List, X, ArrowUpDown, Heart } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  getUserWishlist,
  getWishlistEntry,
  getGameByBarcode,
  getGameByBggId,
  createSharedGame,
  addGameToWishlist,
  updateWishlistEntry,
  removeGameFromWishlist,
  moveGameFromWishlistToLibrary,
  checkGameInUserCollections,
} from '../lib/games';
import { lookupBarcodeWithBgg, submitBarcodeToGameUpc } from '../lib/bgg';
import { UserWishlistEntry, Game } from '../lib/supabase';
import WishlistCard from './WishlistCard';
import BarcodeScanner from './BarcodeScanner';
import EditWishlistModal from './EditWishlistModal';
import Tooltip from './Tooltip';

type SortOption = 'name-asc' | 'name-desc' | 'date-added-desc' | 'date-added-asc' | 'priority-desc' | 'priority-asc';

export default function Wishlist() {
  const { user, refreshProfile } = useAuth();
  const [wishlist, setWishlist] = useState<(UserWishlistEntry & { game: Game })[]>([]);
  const [filteredWishlist, setFilteredWishlist] = useState<(UserWishlistEntry & { game: Game })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showScanner, setShowScanner] = useState(false);
  const [editingWishlistItem, setEditingWishlistItem] = useState<(UserWishlistEntry & { game: Game }) | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{ inLibrary: boolean; inWishlist: boolean }>({ inLibrary: false, inWishlist: false });
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [userLayout, setUserLayout] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('priority-desc');
  const [priorityFilter, setPriorityFilter] = useState<'high' | 'medium' | 'low' | 'all'>('all');

  const [filters, setFilters] = useState({
    publishers: [] as string[],
    gameTypes: [] as string[],
    gameCategories: [] as string[],
    years: [] as string[],
  });

  // const availableFilters = useMemo(() => {
  //   const publishers = new Set<string>();
  //   const gameTypes = new Set<string>();
  //   const gameCategories = new Set<string>();
  //   const years = new Set<string>();

  //   wishlist.forEach((entry) => {
  //     if (entry.game.publisher) publishers.add(entry.game.publisher);
  //     if (entry.game.year) years.add(entry.game.year);
  //     entry.game.game_type?.forEach((type) => gameTypes.add(type));
  //     entry.game.game_category?.forEach((cat) => gameCategories.add(cat));
  //   });

  //   return {
  //     publishers: Array.from(publishers).sort(),
  //     gameTypes: Array.from(gameTypes).sort(),
  //     gameCategories: Array.from(gameCategories).sort(),
  //     years: Array.from(years).sort(),
  //   };
  // }, [wishlist]);

  useEffect(() => {
    if (user) {
      loadWishlist();
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
    let filtered = [...wishlist];

    if (searchQuery) {
      filtered = filtered.filter(
        (entry) =>
          entry.game.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          entry.game.publisher?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          entry.game.barcode.includes(searchQuery) ||
          entry.notes?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (priorityFilter !== 'all') {
      filtered = filtered.filter((entry) => entry.priority === priorityFilter);
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

    if (filters.years.length > 0) {
      filtered = filtered.filter((entry) => entry.game.year && filters.years.includes(entry.game.year));
    }

    const priorityOrder = { high: 3, medium: 2, low: 1 };

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
        case 'priority-desc':
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        case 'priority-asc':
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        default:
          return 0;
      }
    });

    setFilteredWishlist(filtered);
  }, [wishlist, searchQuery, priorityFilter, filters, sortBy]);

  const loadWishlist = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const data = await getUserWishlist(user.id);
      setWishlist(data);
    } catch (error) {
      console.error('Error loading wishlist:', error);
    } finally {
      setLoading(false);
    }
  };

  // const handleGameAdded = async () => {
  //   await loadWishlist();
  //   await refreshProfile();
  // };

  const handleScanBarcode = async (barcode: string, addToWishlist: boolean = true) => {
    if (!user) return;

    try {
      let game = await getGameByBarcode(barcode);

      if (!game) {
        try {
          const gameData = await lookupBarcodeWithBgg(barcode);

          if (gameData.bgg_id) {
            const existingGame = await getGameByBggId(gameData.bgg_id);
            if (existingGame) {
              game = existingGame;
              console.log(`Game already exists with BGG ID ${gameData.bgg_id}, using existing entry`);
            }
          }

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

          if (gameData.source !== 'gameupc' && gameData.bgg_id) {
            submitBarcodeToGameUpc(barcode, gameData.bgg_id).catch((err) => {
              console.error('Failed to submit barcode mapping (non-fatal):', err);
            });
          }
        } catch (lookupError) {
          console.error('Barcode lookup failed:', lookupError);
          setShowScanner(false);
          alert('Could not find game information for this barcode. Please try manual entry.');
          return;
        }
      }

      // Check if game is already in user's collections
      const collections = await checkGameInUserCollections(user.id, game.id);
      if (collections.inLibrary || collections.inWishlist) {
        setDuplicateInfo({ inLibrary: collections.inLibrary, inWishlist: collections.inWishlist });
        setShowScanner(false);
        setShowDuplicateModal(true);
        return;
      }

      if (addToWishlist) {
        await addGameToWishlist(user.id, game.id);
        await loadWishlist();
      }

      await refreshProfile();
      setShowScanner(false);
    } catch (error) {
      console.error('Error adding game:', error);
      alert('Failed to add game. Please try again.');
    }
  };

  const handleMoveToLibrary = async (wishlistEntryId: string) => {
    if (!user) return;

    try {
      await moveGameFromWishlistToLibrary(user.id, wishlistEntryId);
      await loadWishlist();
      await refreshProfile();
    } catch (error) {
      console.error('Error moving game to library:', error);
      alert('Failed to move game to library. Please try again.');
    }
  };

  const handleDeleteWishlistItem = async (entryId: string) => {
    const entry = wishlist.find((e) => e.id === entryId);
    const gameName = entry?.game.name || 'this game';

    if (!confirm(`Are you sure you want to remove "${gameName}" from your wishlist?`)) {
      return;
    }

    try {
      await removeGameFromWishlist(entryId);
      await loadWishlist();
      await refreshProfile();
    } catch (error) {
      console.error('Error deleting wishlist item:', error);
    }
  };

  const handleSaveEdit = async (entryId: string, updates: Partial<UserWishlistEntry>) => {
    try {
      await updateWishlistEntry(entryId, updates);
      const updatedEntry = await getWishlistEntry(entryId);
      setWishlist((prev) => prev.map((entry) => (entry.id === entryId ? updatedEntry : entry)));
      await refreshProfile();
      setEditingWishlistItem(null);
    } catch (error) {
      console.error('Error updating wishlist item:', error);
    }
  };

  // const toggleFilterValue = (category: keyof typeof filters, value: string) => {
  //   setFilters((prev) => {
  //     const currentValues = prev[category] as string[];
  //     const newValues = currentValues.includes(value)
  //       ? currentValues.filter((v) => v !== value)
  //       : [...currentValues, value];
  //     return { ...prev, [category]: newValues };
  //   });
  // };

  const clearAllFilters = () => {
    setFilters({
      publishers: [],
      gameTypes: [],
      gameCategories: [],
      years: [],
    });
    setPriorityFilter('all');
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (priorityFilter !== 'all') count++;
    count += filters.publishers.length;
    count += filters.gameTypes.length;
    count += filters.gameCategories.length;
    count += filters.years.length;
    return count;
  }, [priorityFilter, filters]);

  return (
    <div className="min-h-screen bg-cream">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-8 sm:py-12">
        <div className="mb-8 sm:mb-12 space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 border-b thin-rule rule-line pb-6">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search wishlist..."
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
              className="flex items-center justify-center gap-2 bg-terracotta-600 text-cream px-6 py-3 hover:bg-terracotta-700 transition-colors font-body text-sm"
            >
              <Heart className="w-4 h-4" strokeWidth={1.5} />
              <span>Add to Wishlist</span>
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

              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value as 'high' | 'medium' | 'low' | 'all')}
                className="px-3 py-2 border thin-rule rule-line bg-cream text-xs font-body uppercase tracking-wider hover:bg-slate-50 transition"
              >
                <option value="all">All Priorities</option>
                <option value="high">High Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="low">Low Priority</option>
              </select>

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
                  <option value="priority-desc">High Priority First</option>
                  <option value="priority-asc">Low Priority First</option>
                  <option value="name-asc">Name (A-Z)</option>
                  <option value="name-desc">Name (Z-A)</option>
                  <option value="date-added-desc">Recently Added</option>
                  <option value="date-added-asc">Oldest First</option>
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
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
          </div>
        ) : filteredWishlist.length === 0 ? (
          <div className="text-center py-20">
            <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Heart className="w-10 h-10 text-slate-400" />
            </div>
            <h3 className="text-xl font-display font-light text-slate-900 mb-2">
              {wishlist.length === 0 ? 'No wishlist items yet' : 'No games match your search'}
            </h3>
            <p className="text-slate-600 mb-6">
              {wishlist.length === 0
                ? 'Start building your wishlist by scanning a barcode or searching by title'
                : 'Try adjusting your search or filters'}
            </p>
            <button
              onClick={() => setShowScanner(true)}
              className="inline-flex items-center space-x-2 bg-terracotta-600 text-white px-6 py-3 rounded-lg hover:bg-terracotta-700 transition font-medium"
            >
              <Heart className="w-5 h-5" />
              <span>{wishlist.length === 0 ? 'Add Your First Wishlist Item' : 'Add to wishlist'}</span>
            </button>
          </div>
        ) : layout === 'list' ? (
          <div className="space-y-3">
            {filteredWishlist.map((entry) => (
              <WishlistCard
                key={entry.id}
                entry={entry}
                onEdit={setEditingWishlistItem}
                onDelete={handleDeleteWishlistItem}
                onMoveToLibrary={handleMoveToLibrary}
                layout="list"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-0.5">
            {filteredWishlist.map((entry) => (
              <WishlistCard
                key={entry.id}
                entry={entry}
                onEdit={setEditingWishlistItem}
                onDelete={handleDeleteWishlistItem}
                onMoveToLibrary={handleMoveToLibrary}
                layout="grid"
              />
            ))}
          </div>
        )}
      </main>

      {showScanner && (
        <BarcodeScanner
          onScan={(barcode, addToWishlist) => handleScanBarcode(barcode, addToWishlist ?? true)}
          onClose={() => setShowScanner(false)}
          onManualEntry={() => {
            setShowScanner(false);
            alert('Manual entry is not yet implemented for wishlist. Please use the main catalogue.');
          }}
        />
      )}

      {showDuplicateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Game Already Added</h2>
            <p className="text-slate-700 mb-6">
              {duplicateInfo.inLibrary && duplicateInfo.inWishlist
                ? 'This game is already in both your library and wishlist.'
                : duplicateInfo.inLibrary
                ? 'This game is already in your library.'
                : 'This game is already in your wishlist.'}
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

      {editingWishlistItem && (
        <EditWishlistModal
          entry={editingWishlistItem}
          onSave={handleSaveEdit}
          onClose={() => setEditingWishlistItem(null)}
          onDelete={handleDeleteWishlistItem}
        />
      )}
    </div>
  );
}