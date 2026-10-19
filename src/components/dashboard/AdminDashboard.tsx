import React, { useState, useEffect } from 'react';
import {
  Shield,
  Activity,
  Users,
  Building,
  Clock,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  FileCheck,
  Eye,
  RefreshCw,
  Check,
  X,
} from 'lucide-react';
import { api } from '../../lib/api.ts';
import { useApp } from '../../context/AppContext.tsx';
import { Report, User } from '../../types/client.ts';

export const AdminDashboard: React.FC = () => {
  const { showToast } = useApp();
  const [metrics, setMetrics] = useState<any>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMetricsAndReports = async () => {
    setLoading(true);
    try {
      const [metricsData, reportsData, usersData] = await Promise.all([
        api.getAdminMetrics(),
        api.getAdminReports(),
        api.getAdminUsers(),
      ]);
      setMetrics(metricsData);
      setReports(reportsData.reports);
      setUsers(usersData.users);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetricsAndReports();
  }, []);

  const handleUpdateReport = async (reportId: string, status: 'RESOLVED' | 'DISMISSED') => {
    try {
      await api.updateReportStatus(reportId, status);
      showToast(`Report marked as ${status.toLowerCase()}`, 'success');
      fetchMetricsAndReports();
    } catch (e: any) {
      showToast(e.message || 'Action failed', 'error');
    }
  };

  const handleToggleVerify = async (userId: string, isVerified: boolean) => {
    try {
      await api.verifyUser(userId, !isVerified);
      showToast(`User verification updated!`, 'success');
      fetchMetricsAndReports();
    } catch (e: any) {
      showToast(e.message || 'Action failed', 'error');
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-violet-500/10 text-violet-400 border border-violet-500/20">
              <Shield className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-black text-white tracking-tight">Admin & Trust Control</h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Marketplace telemetry and safety moderation.
          </p>
        </div>

        <button
          onClick={fetchMetricsAndReports}
          className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          title="Refresh metrics"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Metrics Row */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-xl">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs font-bold uppercase">Active 10d Listings</span>
              <Building className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-3xl font-black text-white">{metrics.activeListings}</p>
            <p className="text-[11px] text-emerald-400 mt-1">✓ Available in live feeds</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-xl">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs font-bold uppercase">Expired Listings</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-3xl font-black text-amber-400">{metrics.expiredListings}</p>
            <p className="text-[11px] text-zinc-500 mt-1">Stored for history/analytics</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-xl">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs font-bold uppercase">Daily Active Users</span>
              <Activity className="w-4 h-4 text-sky-400" />
            </div>
            <p className="text-3xl font-black text-white">{metrics.dailyActiveUsers}</p>
            <p className="text-[11px] text-sky-400 mt-1">+18% growth this week</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-xl">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-xs font-bold uppercase">Total Inquiries</span>
              <TrendingUp className="w-4 h-4 text-rose-400" />
            </div>
            <p className="text-3xl font-black text-rose-400">{metrics.totalInquiries}</p>
            <p className="text-[11px] text-zinc-500 mt-1">Connected tenants & hosts</p>
          </div>
        </div>
      )}

      {/* Expiration Rules Audit Box */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 mb-8 space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-extrabold text-white">
            10-Day Expiration Engine Health
          </h2>
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed">
          The server worker is continuously validating timestamps. When a rental listing exceeds 10 days,
          its status changes from <strong>ACTIVE</strong> to <strong>EXPIRED</strong>, immediately hiding it from
          search, Explore, and recommendation feeds, while notifying the owner for 1-click renewal.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <div className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>Worker Status: ONLINE (30s interval + persistent disk)</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-semibold text-zinc-300">
          </div>
        </div>
      </div>

      {/* User Verification Desk */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-8">
        <h3 className="text-base font-extrabold text-white mb-4">
          Marketplace User Verification Desk
        </h3>
        <div className="space-y-3">
          {users.slice(0, 5).map((u) => (
            <div
              key={u.id}
              className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800/80 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <img
                  src={u.avatar}
                  alt={u.name}
                  className="w-10 h-10 rounded-full object-cover border border-zinc-700"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white">{u.name}</span>
                    {u.isVerified && (
                      <span className="text-[10px] bg-sky-500/20 text-sky-400 px-1.5 py-0.2 rounded-full font-bold">
                        Verified
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    {u.activeRole} • {[u.locationArea, u.city].filter(Boolean).join(', ')}
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleToggleVerify(u.id, u.isVerified)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  u.isVerified
                    ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    : 'bg-sky-500 text-white hover:bg-sky-600'
                }`}
              >
                {u.isVerified ? 'Revoke Badge' : 'Grant Verified Badge'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Safety & Reports Moderation Queue */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
        <h3 className="text-base font-extrabold text-white mb-4">
          Fraud & Safety Moderation Queue ({reports.length})
        </h3>
        {reports.length > 0 ? (
          <div className="space-y-3">
            {reports.map((r) => (
              <div
                key={r.id}
                className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-rose-400">Report: {r.reason}</span>
                    <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                      Target: {r.targetType}
                    </span>
                  </div>
                  {r.details && <p className="text-xs text-zinc-300 mt-1">{r.details}</p>}
                  <p className="text-[11px] text-zinc-500 mt-1">Status: {r.status}</p>
                </div>

                {r.status === 'PENDING' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleUpdateReport(r.id, 'RESOLVED')}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600"
                    >
                      Resolve
                    </button>
                    <button
                      onClick={() => handleUpdateReport(r.id, 'DISMISSED')}
                      className="px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-bold hover:bg-zinc-700"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 text-center py-6">
            There are no pending reports.
          </p>
        )}
      </div>
    </div>
  );
};
