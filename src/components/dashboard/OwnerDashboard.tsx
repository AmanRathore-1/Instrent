import React, { useState, useEffect } from 'react';
import {
  Layers,
  Clock,
  CheckCircle,
  RefreshCw,
  Plus,
  AlertTriangle,
  Eye,
  MessageSquare,
  Users,
  ChevronRight,
  ShieldCheck,
  Building,
  Calendar,
  Check,
  X,
  Trash2,
} from 'lucide-react';
import { RentalListing, VisitRequest } from '../../types/client.ts';
import { api } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';

export const OwnerDashboard: React.FC = () => {
  const { currentUser, openCreateModal, showToast, setActiveView } = useApp();

  const [listings, setListings] = useState<RentalListing[]>([]);
  const [visits, setVisits] = useState<VisitRequest[]>([]);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'EXPIRED' | 'RENTED'>('ALL');
  const [loading, setLoading] = useState(true);

  const loadOwnerData = async () => {
    setLoading(true);
    try {
      const queryParams: Record<string, string> = { status: 'ALL' };
      if (currentUser?.id) {
        queryParams.ownerId = currentUser.id;
      }
      const [listingsData, visitsData] = await Promise.all([
        api.getListings(queryParams),
        api.getVisitRequests(),
      ]);
      setListings(listingsData.listings);
      setVisits(visitsData.visits.filter((v) => v.ownerId === currentUser?.id));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOwnerData();
  }, [currentUser?.id]);

  const handleRenew = async (listingId: string) => {
    try {
      const res = await api.renewListing(listingId);
      showToast(res.message, 'success');
      loadOwnerData();
    } catch (e: any) {
      showToast(e.message || 'Renewal failed', 'error');
    }
  };

  const handleMarkRented = async (listingId: string) => {
    try {
      const res = await api.markListingRented(listingId);
      showToast(res.message, 'success');
      loadOwnerData();
    } catch (e: any) {
      showToast(e.message || 'Action failed', 'error');
    }
  };

  const handleDeleteListing = async (listingId: string) => {
    try {
      await api.deleteListing(listingId);
      showToast('Listing removed successfully', 'info');
      loadOwnerData();
    } catch (e: any) {
      showToast(e.message || 'Could not delete listing', 'error');
    }
  };

  const handleUpdateVisitStatus = async (visitId: string, status: 'ACCEPTED' | 'REJECTED') => {
    try {
      await api.updateVisitRequestStatus(visitId, status);
      showToast(`Walkthrough request ${status.toLowerCase()}!`, 'success');
      loadOwnerData();
    } catch (e: any) {
      showToast(e.message || 'Could not update status', 'error');
    }
  };

  const activeCount = listings.filter((l) => l.status === 'ACTIVE').length;
  const expiredCount = listings.filter((l) => l.status === 'EXPIRED').length;
  const rentedCount = listings.filter((l) => l.status === 'RENTED').length;
  const totalViews = listings.reduce((acc, l) => acc + (l.viewsCount || 0), 0);
  const totalInquiries = listings.reduce((acc, l) => acc + (l.inquiriesCount || 0), 0);

  const displayedListings = listings.filter((l) => {
    if (filterStatus === 'ALL') return true;
    return l.status === filterStatus;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-24">
      {/* Dashboard Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Layers className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-black text-white tracking-tight">
              Owner & PG Inventory Hub
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Manage your 10-day expiring room listings, renewals, rented units & tenant inquiries.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveView('find-property')}
            className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-200 flex items-center gap-1.5"
          >
            <Users className="w-4 h-4 text-amber-400" />
            <span>Search Tenants</span>
          </button>

          <button
            onClick={() => openCreateModal('post')}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:opacity-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-rose-500/20 active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>New 10-Day Listing</span>
          </button>
        </div>
      </div>

      {/* Real-time Performance Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4">
          <p className="text-[11px] font-bold text-zinc-400 uppercase">Active Units</p>
          <p className="text-2xl font-black text-emerald-400 mt-1">{activeCount}</p>
          <span className="text-[10px] text-zinc-500">Live in feed</span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4">
          <p className="text-[11px] font-bold text-zinc-400 uppercase">Expired Units</p>
          <p className="text-2xl font-black text-amber-400 mt-1">{expiredCount}</p>
          <span className="text-[10px] text-zinc-500">Ready for renewal</span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4">
          <p className="text-[11px] font-bold text-zinc-400 uppercase">Rented Units</p>
          <p className="text-2xl font-black text-sky-400 mt-1">{rentedCount}</p>
          <span className="text-[10px] text-zinc-500">Occupied</span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4">
          <p className="text-[11px] font-bold text-zinc-400 uppercase">Total Views</p>
          <p className="text-2xl font-black text-white mt-1">{totalViews}</p>
          <span className="text-[10px] text-zinc-500">Tenant impressions</span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4 col-span-2 sm:col-span-1">
          <p className="text-[11px] font-bold text-zinc-400 uppercase">Inquiries</p>
          <p className="text-2xl font-black text-rose-400 mt-1">{totalInquiries}</p>
          <span className="text-[10px] text-zinc-500">Chats initiated</span>
        </div>
      </div>

      {/* Physical Walkthrough Requests Panel */}
      {visits.length > 0 && (
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 mb-8 shadow-xl">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-extrabold text-white">
              Tenant Walkthrough Appointments ({visits.length})
            </h3>
          </div>

          <div className="space-y-3">
            {visits.map((v) => (
              <div
                key={v.id}
                className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-zinc-100">{v.tenant?.name || 'A prospective tenant'}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        v.status === 'ACCEPTED'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : v.status === 'REJECTED'
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}
                    >
                      {v.status}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    Requested Day: <strong className="text-zinc-200">{v.preferredDate}</strong> ({v.preferredTime})
                  </p>
                  {v.message && <p className="text-[11px] text-zinc-500 mt-0.5">"{v.message}"</p>}
                </div>

                {v.status === 'PENDING' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleUpdateVisitStatus(v.id, 'ACCEPTED')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Confirm Visit</span>
                    </button>
                    <button
                      onClick={() => handleUpdateVisitStatus(v.id, 'REJECTED')}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Decline</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center justify-between border-b border-zinc-800 mb-6 pb-2">
        <div className="flex items-center gap-2">
          {(['ALL', 'ACTIVE', 'EXPIRED', 'RENTED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterStatus === st
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {st === 'ALL'
                ? 'All Listings'
                : st === 'ACTIVE'
                ? `Active (${activeCount})`
                : st === 'EXPIRED'
                ? `Expired (${expiredCount})`
                : `Rented (${rentedCount})`}
            </button>
          ))}
        </div>

        <button
          onClick={loadOwnerData}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Listing Management Cards */}
      <div className="space-y-4">
        {displayedListings.map((listing) => {
          const diffMs = new Date(listing.expiresAt).getTime() - Date.now();
          const remainingDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

          return (
            <div
              key={listing.id}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4">
                <img
                  src={listing.photos[0]}
                  alt={listing.title}
                  className="w-20 h-20 rounded-2xl object-cover bg-zinc-950 flex-shrink-0"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        listing.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : listing.status === 'EXPIRED'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                      }`}
                    >
                      {listing.status}
                    </span>
                    <span className="text-xs text-zinc-400">{listing.area}, {listing.city}</span>
                  </div>

                  <h3 className="font-bold text-base text-white mt-1">{listing.title}</h3>

                  <div className="flex items-center gap-4 text-xs text-zinc-400 mt-1">
                    <span className="font-bold text-zinc-200">
                      ₹{listing.rent.toLocaleString('en-IN')}/mo
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      {listing.viewsCount} views
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5" />
                      {listing.inquiriesCount} inquiries
                    </span>
                  </div>
                </div>
              </div>

              {/* 10-Day Expiry Status & Action Controls */}
              <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
                {listing.status === 'ACTIVE' && (
                  <div className="text-right sm:mr-2">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">10-Day Lifecycle</p>
                    <p
                      className={`text-xs font-bold ${
                        remainingDays <= 1 ? 'text-rose-400 animate-pulse' : 'text-emerald-400'
                      }`}
                    >
                      {remainingDays <= 1 ? 'Expires in <24h' : `${remainingDays} days remaining`}
                    </p>
                  </div>
                )}

                {listing.status === 'EXPIRED' && (
                  <div className="text-right sm:mr-2">
                    <p className="text-[10px] font-bold uppercase text-amber-400">Hidden from Feed</p>
                    <p className="text-xs font-bold text-zinc-400">Expired after 10 days</p>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {/* RENEW BUTTON */}
                  <button
                    onClick={() => handleRenew(listing.id)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all flex items-center gap-1.5"
                    title="Reset 10-day active timer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Renew 10 Days</span>
                  </button>

                  {/* MARK RENTED BUTTON */}
                  {listing.status !== 'RENTED' && (
                    <button
                      onClick={() => handleMarkRented(listing.id)}
                      className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-colors"
                    >
                      Mark Rented
                    </button>
                  )}

                  {/* DELETE LISTING */}
                  <button
                    onClick={() => handleDeleteListing(listing.id)}
                    className="p-2 rounded-xl bg-zinc-800 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 transition-colors"
                    title="Delete listing"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {displayedListings.length === 0 && !loading && (
          <div className="py-20 text-center bg-zinc-900/40 rounded-3xl border border-zinc-800">
            <Building className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
            <p className="text-zinc-300 font-bold">No {filterStatus.toLowerCase()} listings</p>
            <p className="text-xs text-zinc-500 mt-1">
              Create a new 10-day room listing to reach people looking for a place to live.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
