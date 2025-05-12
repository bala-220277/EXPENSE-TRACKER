
"use client";

import { useState, useEffect } from "react";
// import { useRouter } from 'next/navigation'; // No longer needed for redirect
import { useAuth } from '@/context/AuthContext';
import { AppHeader } from "@/components/app-header";
import { ExpenseForm } from "@/components/expense-form";
import { TransactionList } from "@/components/transaction-list";
import { StatementUploader } from "@/components/statement-uploader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import type { Transaction } from "@/lib/app-types";
import { 
  isSameDay, 
  isSameMonth, 
  parseISO, 
  format as formatDateFns,
  isWithinInterval,
  startOfDay,
  endOfDay
} from "date-fns";
import { TrendingUp, ArrowUpCircle, ArrowDownCircle, Target, Loader2 } from "lucide-react"; // Ensured Target is imported without alias

// Generic local storage keys as there is no user login
const LOCAL_STORAGE_KEY_TRANSACTIONS = "expenseVisionTransactions_generic";
const LOCAL_STORAGE_KEY_MONTHLY_TARGET = "expenseVisionMonthlyTarget_generic";

const LOCAL_STORAGE_SETTINGS_PREFIX = "expenseVisionSettings";
const LOCAL_STORAGE_KEY_CURRENCY = `${LOCAL_STORAGE_SETTINGS_PREFIX}Currency`;
const LOCAL_STORAGE_KEY_THEME = `${LOCAL_STORAGE_SETTINGS_PREFIX}Theme`;


export default function HomePage() {
  const { 
    // user, // user from useAuth is always null
    // loading: authLoading // authLoading from useAuth is always false
  } = useAuth(); 
  const { toast } = useToast();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [monthlyTarget, setMonthlyTarget] = useState<number | null>(null);
  const [newTargetInput, setNewTargetInput] = useState<string>("");
  const [isClient, setIsClient] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState("INR");
  
  // Generic local storage keys
  const getTransactionsKey = () => LOCAL_STORAGE_KEY_TRANSACTIONS;
  const getMonthlyTargetKey = () => LOCAL_STORAGE_KEY_MONTHLY_TARGET;

  useEffect(() => {
    setIsClient(true);
  }, []);


  useEffect(() => {
    if (isClient) { 
      // Load transactions
      const transactionsKey = getTransactionsKey();
      const storedTransactions = localStorage.getItem(transactionsKey);
      if (storedTransactions) {
        try {
          const parsedTransactions: Transaction[] = JSON.parse(storedTransactions);
          const sanitizedTransactions = parsedTransactions.map(t => ({
            ...t,
            date: t.date || new Date().toISOString().split('T')[0], // Ensure date is present
            type: t.type || 'expense' 
          }));
          setTransactions(sanitizedTransactions);
        } catch (error) {
          console.error("Failed to parse transactions from localStorage", error);
          localStorage.removeItem(transactionsKey); 
        }
      }

      // Load monthly target
      const monthlyTargetKey = getMonthlyTargetKey();
      const storedTarget = localStorage.getItem(monthlyTargetKey);
      if (storedTarget) {
        try {
          setMonthlyTarget(parseFloat(storedTarget));
        } catch (error) {
          console.error("Failed to parse monthly target from localStorage", error);
          localStorage.removeItem(monthlyTargetKey);
        }
      }
    }
     // Load currency and theme regardless of user, as they are app-wide settings
     const storedCurrency = localStorage.getItem(LOCAL_STORAGE_KEY_CURRENCY);
     if (storedCurrency) {
         setDisplayCurrency(storedCurrency);
     } else {
       localStorage.setItem(LOCAL_STORAGE_KEY_CURRENCY, "INR");
       setDisplayCurrency("INR");
     }
 
     const storedTheme = localStorage.getItem(LOCAL_STORAGE_KEY_THEME);
     if (storedTheme === "dark") {
       document.documentElement.classList.add("dark");
     } else if (storedTheme === "light") {
       document.documentElement.classList.remove("dark");
     } else { 
       document.documentElement.classList.remove("dark"); 
       if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
         document.documentElement.classList.add("dark");
       }
       if(!storedTheme) localStorage.setItem(LOCAL_STORAGE_KEY_THEME, "system");
     }
  }, [isClient]); 

  useEffect(() => {
    if(isClient) { 
      const transactionsKey = getTransactionsKey();
      localStorage.setItem(transactionsKey, JSON.stringify(transactions));
    }
  }, [transactions, isClient]);

  useEffect(() => {
    if (isClient) { 
      const monthlyTargetKey = getMonthlyTargetKey();
      if (monthlyTarget !== null) {
        localStorage.setItem(monthlyTargetKey, monthlyTarget.toString());
      } else {
        localStorage.removeItem(monthlyTargetKey);
      }
    }
  }, [monthlyTarget, isClient]);

  const handleAddTransaction = (newTransaction: Transaction) => {
    setTransactions((prevTransactions) => [newTransaction, ...prevTransactions]);
  };

  const handleTransactionsSummarized = (summarizedTransactions: Transaction[]) => {
    setTransactions((prevTransactions) => {
      const existingSignatures = new Set(prevTransactions.map(t => `${t.date}-${t.amount}-${t.description}-${t.type}`));
      const newUniqueTransactions = summarizedTransactions.filter(t => !existingSignatures.has(`${t.date}-${t.amount}-${t.description}-${t.type}`));
      return [...newUniqueTransactions, ...prevTransactions];
    });
  };

  const handleSetTarget = () => {
    const targetValue = parseFloat(newTargetInput);
    if (!isNaN(targetValue) && targetValue > 0) {
      setMonthlyTarget(targetValue);
      toast({
        title: "Monthly Target Set",
        description: `Your new monthly spending target is ${targetValue.toLocaleString(undefined, { style: "currency", currency: displayCurrency })}.`,
      });
      setNewTargetInput(""); 
    } else if (!isNaN(targetValue) && targetValue <= 0) {
       setMonthlyTarget(null);
       toast({
        title: "Monthly Target Cleared",
        description: "Monthly spending target has been removed.",
      });
      setNewTargetInput("");
    }
    else {
      toast({
        title: "Invalid Target",
        description: "Please enter a valid positive number for the target, or 0 to clear.",
        variant: "destructive",
      });
    }
  };

  const calculateTotals = () => {
    const currentDate = new Date();
    let dailyExpenses = 0;
    let monthlyExpenses = 0;
    let dailyIncome = 0;
    let monthlyIncome = 0;

    transactions.forEach(transaction => {
      try {
        const transactionDate = parseISO(transaction.date);
        if (transaction.type === 'expense') {
          if (isSameDay(transactionDate, currentDate)) {
            dailyExpenses += transaction.amount;
          }
          if (isSameMonth(transactionDate, currentDate)) {
            monthlyExpenses += transaction.amount;
          }
        } else if (transaction.type === 'income') {
          if (isSameDay(transactionDate, currentDate)) {
            dailyIncome += transaction.amount;
          }
          if (isSameMonth(transactionDate, currentDate)) {
            monthlyIncome += transaction.amount;
          }
        }
      } catch (error) {
        console.error("Error parsing transaction date:", transaction.date, error);
      }
    });
    return { dailyExpenses, monthlyExpenses, dailyIncome, monthlyIncome };
  };

  const { dailyExpenses, monthlyExpenses, dailyIncome, monthlyIncome } = isClient ? calculateTotals() : { dailyExpenses: 0, monthlyExpenses: 0, dailyIncome: 0, monthlyIncome: 0 };
  
  const progressPercentage = (monthlyTarget && monthlyTarget > 0) ? (monthlyExpenses / monthlyTarget) * 100 : 0;

  const handleDownloadTransactions = (customStartDate?: Date, customEndDate?: Date) => {
    let transactionsToProcess = [...transactions];

    if (customStartDate && customEndDate) {
      if (customStartDate > customEndDate) {
        toast({
            title: "Invalid Date Range",
            description: "Start date cannot be after end date.",
            variant: "destructive",
        });
        return;
      }
      const start = startOfDay(customStartDate);
      const end = endOfDay(customEndDate);
      transactionsToProcess = transactions.filter(t => {
        try {
          const transactionDate = parseISO(t.date);
          return isWithinInterval(transactionDate, { start, end });
        } catch { return false; }
      });
    } else if (customStartDate) { // Only start date provided
      const start = startOfDay(customStartDate);
      transactionsToProcess = transactions.filter(t => {
        try {
          const transactionDate = parseISO(t.date);
          return transactionDate >= start;
        } catch { return false; }
      });
    } else if (customEndDate) { // Only end date provided
      const end = endOfDay(customEndDate);
      transactionsToProcess = transactions.filter(t => {
        try {
          const transactionDate = parseISO(t.date);
          return transactionDate <= end;
        } catch { return false; }
      });
    }
    // If neither customStartDate nor customEndDate is provided, transactionsToProcess remains the full list.

    if (transactionsToProcess.length === 0) {
      const message = (customStartDate || customEndDate) 
        ? "No transactions found for the selected date range."
        : "There are no transactions to download.";
      toast({
        title: "No Transactions",
        description: message,
        variant: "default"
      });
      return;
    }

    const escapeCsvCell = (cellData: string | number) => {
      const stringData = String(cellData);
      if (stringData.includes(',') || stringData.includes('"') || stringData.includes('\n')) {
        return `"${stringData.replace(/"/g, '""')}"`;
      }
      return stringData;
    };
    
    const headers = `Date,Description,Category,Type,Amount (${displayCurrency})`;
    const csvRows = transactionsToProcess // Use filtered list
      .sort((a, b) => { // Sort by date descending
        try {
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        } catch { return 0; }
      })
      .map(t => {
        let formattedDate = "Invalid Date";
        try {
          formattedDate = formatDateFns(parseISO(t.date), "yyyy-MM-dd");
        } catch {}
        return [
          formattedDate,
          escapeCsvCell(t.description),
          escapeCsvCell(t.category),
          escapeCsvCell(t.type),
          t.amount.toFixed(2) 
        ].join(',');
      }
      );

    const csvString = [headers, ...csvRows].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      const dateSuffix = (customStartDate || customEndDate) 
        ? `from_${customStartDate ? formatDateFns(customStartDate, "yyyyMMdd") : "start"}_to_${customEndDate ? formatDateFns(customEndDate, "yyyyMMdd") : "all-time"}`
        : `all_${formatDateFns(new Date(), "yyyy-MM-dd")}`;
      link.setAttribute("download", `transactions-${dateSuffix}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({
        title: "Download Started",
        description: "Your transactions are being downloaded.",
      });
    } else {
       toast({
        title: "Download Failed",
        description: "Your browser does not support automatic downloads.",
        variant: "destructive"
      });
    }
  };


  if (!isClient) { 
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <AppHeader />
        <main className="container mx-auto p-4 md:p-8 max-w-3xl flex-grow flex items-center justify-center">
          <div className="text-center py-10 text-muted-foreground">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p>Loading your financial dashboard...</p>
          </div>
        </main>
         <footer className="text-center p-4 text-muted-foreground text-sm">
            © {new Date().getFullYear()} Expense Vision. All rights reserved.
        </footer>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader />
      <main className="container mx-auto p-4 md:p-8 max-w-3xl flex-grow">
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Upload Statement</CardTitle>
              <CardDescription>
                Upload a bank statement (PDF or image) to automatically extract and categorize your transactions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StatementUploader onTransactionsSummarized={handleTransactionsSummarized} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Log Transaction</CardTitle>
              <CardDescription>
                Manually add a new income or expense entry.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ExpenseForm onAddTransaction={handleAddTransaction} currency={displayCurrency} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-row items-center justify-between space-y-0">
                <CardTitle>Set Monthly Spending Target</CardTitle>
                <Target className="h-5 w-5 text-primary" /> {/* Changed TargetIcon to Target */}
              </div>
              <CardDescription>
                Define your budget for the month to track your spending. Enter 0 to clear the target.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="e.g., 50000"
                  value={newTargetInput}
                  onChange={(e) => setNewTargetInput(e.target.value)}
                  min="0"
                />
                <Button onClick={handleSetTarget}>Set Target</Button>
              </div>
              {monthlyTarget !== null && monthlyTarget > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Current Target: {monthlyTarget.toLocaleString(undefined, { style: "currency", currency: displayCurrency })}
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Today&apos;s Income
                </CardTitle>
                <ArrowDownCircle className="h-5 w-5 text-green-500" /> {/* Changed from ArrowUpCircle */}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {dailyIncome.toLocaleString(undefined, { style: "currency", currency: displayCurrency })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total income today
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Today&apos;s Expenses
                </CardTitle>
                <ArrowUpCircle className="h-5 w-5 text-red-500" /> {/* Changed from ArrowDownCircle */}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {dailyExpenses.toLocaleString(undefined, { style: "currency", currency: displayCurrency })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total spent today
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  This Month&apos;s Income
                </CardTitle>
                <TrendingUp className="h-5 w-5 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {monthlyIncome.toLocaleString(undefined, { style: "currency", currency: displayCurrency })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Total income so far this month
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  This Month&apos;s Expenses
                </CardTitle>
                <TrendingUp className="h-5 w-5 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {monthlyExpenses.toLocaleString(undefined, { style: "currency", currency: displayCurrency })}
                </div>
                {monthlyTarget !== null && monthlyTarget > 0 ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      out of {monthlyTarget.toLocaleString(undefined, { style: "currency", currency: displayCurrency })} target
                    </p>
                    <Progress
                      value={Math.min(progressPercentage, 100)} 
                      className="mt-2 h-3" 
                      indicatorColorClass={monthlyExpenses > monthlyTarget ? "bg-destructive" : "bg-primary"}
                    />
                    {monthlyExpenses > monthlyTarget && (
                      <p className="text-xs text-destructive mt-1 font-medium">
                        Over budget by {(monthlyExpenses - monthlyTarget).toLocaleString(undefined, { style: "currency", currency: displayCurrency })}!
                      </p>
                    )}
                     {monthlyExpenses <= monthlyTarget && progressPercentage > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                            {progressPercentage.toFixed(0)}% of target spent.
                        </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Total spent so far this month. Set a target to track progress.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <TransactionList 
                transactions={transactions} 
                currency={displayCurrency}
                onDownloadTransactions={handleDownloadTransactions}
            />
          </Card>
        </div>
      </main>
      <footer className="text-center p-4 text-muted-foreground text-sm">
        © {new Date().getFullYear()} Expense Vision. All rights reserved.
      </footer>
    </div>
  );
}
