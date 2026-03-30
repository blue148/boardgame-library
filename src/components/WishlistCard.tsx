import { useState } from 'react';
import { Trash2, CreditCard as Edit, MoreVertical, BookOpen, ShoppingCart, ArrowRight } from 'lucide-react';
import { UserWishlistEntry, Game } from '../lib/supabase';
import Tooltip from './Tooltip';

interface WishlistCardProps {
  entry: UserWishlistEntry & { game: Game };
  onEdit: (entry: UserWishlistEntry & { game: Game }) => void;
  onDelete: (entryId: string) => void;
  onMoveToLibrary: (entryId: string) => void;
  layout?: 'grid' | 'list';
}

export default function WishlistCard({ entry, onEdit, onDelete, onMoveToLibrary, layout = 'grid' }: WishlistCardProps) {
  const { game } = entry;
  const [showMenu, setShowMenu] = useState(false);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (layout === 'list') {
    return (
      <div className="bg-white container-radius shadow-sm border border-container hover:shadow-md transition group flex relative">
        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-slate-100 flex-shrink-0 overflow-hidden rounded-l-[2px]">
          {game.cover_image ? (
            <img
              src={game.cover_image}
              alt={game.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              <BookOpen className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>
          )}
        </div>

        <div className="flex-1 p-3 sm:p-4 flex items-center min-w-0">
          <div className="flex-1 min-w-0 mr-2 sm:mr-4">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-slate-900 truncate text-sm sm:text-base">{game.name}</h3>
              <span className={`flex-shrink-0 px-2 py-0.5 text-xs font-medium rounded border ${getPriorityColor(entry.priority)}`}>
                {entry.priority} priority
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-600 flex-wrap">
              {game.year && (
                <span>{game.year}</span>
              )}
              {game.publisher && (
                <>
                  <span>•</span>
                  <span className="truncate">{game.publisher}</span>
                </>
              )}
            </div>
            {entry.notes && (
              <p className="text-xs text-slate-600 mt-1 line-clamp-2">{entry.notes}</p>
            )}
          </div>

          <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
            <Tooltip content="Move to Library">
              <button
                onClick={() => onMoveToLibrary(entry.id)}
                className="p-1.5 sm:p-2 bg-green-100 text-green-700 container-radius hover:bg-green-200 transition"
              >
                <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </Tooltip>
            <div className="relative">
              <Tooltip content="More options">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1.5 sm:p-2 bg-slate-100 text-slate-700 container-radius hover:bg-slate-200 transition"
                >
                  <MoreVertical className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </Tooltip>
              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-[100]"
                    onClick={() => setShowMenu(false)}
                  />
                  <div className="absolute left-0 mt-1 w-40 bg-white container-radius shadow-lg border border-container py-1 z-[101]">
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        onEdit(entry);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Edit className="w-4 h-4" />
                      <span>Edit Details</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        onDelete(entry.id);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Remove</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-cream linen-texture border thin-rule rule-line hover:shadow-sm transition group flex flex-col overflow-hidden">
      <div className="aspect-[3/4] bg-slate-100 relative overflow-hidden border-b thin-rule rule-line">
        {game.cover_image ? (
          <img
            src={game.cover_image}
            alt={game.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <BookOpen className="w-12 h-12" strokeWidth={1} />
          </div>
        )}

        <div className={`absolute top-2 right-2 px-2 py-1 border ${getPriorityColor(entry.priority)}`}>
          <span className="text-xs font-body uppercase tracking-wider">{entry.priority}</span>
        </div>
      </div>

      <div className="p-3 flex flex-col flex-1 relative">
        <h3 className="text-sm font-display font-medium text-slate-900 line-clamp-2 leading-tight mb-2">{game.name}</h3>

        <div className="space-y-1 mb-3">
          {game.year && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-body text-slate-400 uppercase tracking-wider">Year</span>
              <span className="text-xs font-body text-slate-700">{game.year}</span>
            </div>
          )}
          {game.publisher && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-body text-slate-400 uppercase tracking-wider">Publisher</span>
              <span className="text-xs font-body text-slate-700 truncate">{game.publisher}</span>
            </div>
          )}
        </div>

        {entry.notes && (
          <p className="text-xs font-body text-slate-600 line-clamp-3 mb-3">{entry.notes}</p>
        )}

        <div className="flex items-center justify-between mt-auto pt-2 border-t thin-rule rule-line">
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 hover:bg-slate-100 transition-colors"
            >
              <MoreVertical className="w-4 h-4 text-slate-600" strokeWidth={1.5} />
            </button>
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-[100]"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute left-0 bottom-full mb-1 w-40 bg-cream border thin-rule rule-line shadow-lg py-1 z-[101]">
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onEdit(entry);
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-body text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Edit className="w-3.5 h-3.5" strokeWidth={1.5} />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onDelete(entry.id);
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-body text-terracotta-700 hover:bg-terracotta-50 flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    <span>Remove</span>
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => onMoveToLibrary(entry.id)}
            className="flex items-center gap-1.5 px-2 py-1 bg-forest-600 text-cream hover:bg-forest-700 transition-colors"
          >
            <ShoppingCart className="w-3.5 h-3.5" strokeWidth={1.5} />
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}