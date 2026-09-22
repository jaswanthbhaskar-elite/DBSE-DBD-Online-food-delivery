import OwnerHeader from "./OwnerHeader";

const OwnerLayout = ({ children }) => (
    <div className="min-h-screen flex flex-col bg-background">
        <OwnerHeader />
        <main className="flex-1">{children}</main>
    </div>
);

export default OwnerLayout;