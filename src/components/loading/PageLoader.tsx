import './PageLoader.css';

type PageLoaderProps = {
  message?: string;
  fullScreen?: boolean;
};

export function PageLoader({ message, fullScreen = true }: PageLoaderProps) {
  return (
    <div
      className={`page-loader ${fullScreen ? 'page-loader--fullscreen' : 'page-loader--inline'}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="page-loader__content">
        <div className="page-loader__wordmark" aria-label="InstRent">
          <span>Inst</span><strong>Rent</strong>
        </div>
        <span className="page-loader__ring" aria-hidden="true" />
        {message && <p>{message}</p>}
      </div>
    </div>
  );
}
